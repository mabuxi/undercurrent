import Cocoa
import WebKit

// Undercurrent for Mac: a window around the local web app. It starts the Undercurrent server (which starts the local
// AI models), shows the app when it is ready, and when you quit, it stops the server, unloads the models and quits
// Ollama. Your data lives in ~/Library/Application Support/Undercurrent, apart from the code, so updates never touch it.

// The few words the app itself shows (starting, stopping, menus), in the language chosen in Undercurrent's settings.
// The server writes that choice to ~/Library/Application Support/Undercurrent/language; until it exists, the Mac's own
// language decides.
let FRENCH: [String: String] = [
    "Starting Undercurrent…": "Démarrage d’Undercurrent…",
    "Parts of Undercurrent are missing.": "Des éléments d’Undercurrent manquent.",
    "Download Undercurrent again from github.com/mabuxi/undercurrent and replace this copy. Your data is kept.": "Téléchargez de nouveau Undercurrent sur github.com/mabuxi/undercurrent et remplacez cette copie. Vos données sont conservées.",
    "Node.js was not found.": "Node.js est introuvable.",
    "Undercurrent needs Node.js 22 or newer. Install it from nodejs.org, then open Undercurrent again.": "Undercurrent a besoin de Node.js 22 ou plus récent. Installez-le depuis nodejs.org, puis rouvrez Undercurrent.",
    "Preparing the app for the first time…": "Préparation de l’app pour la première fois…",
    "Undercurrent could not start.": "Undercurrent n’a pas pu démarrer.",
    "Finishing the update…": "Fin de la mise à jour…",
    "Opening the new version…": "Ouverture de la nouvelle version…",
    "Undercurrent stopped unexpectedly.": "Undercurrent s’est arrêté de façon inattendue.",
    "Exit code {code}. The log is in ~/Library/Application Support/Undercurrent/app.log.": "Code de sortie {code}. Le journal se trouve dans ~/Library/Application Support/Undercurrent/app.log.",
    "Still starting… the first start can take a minute.": "Démarrage en cours… le premier démarrage peut prendre une minute.",
    "Undercurrent did not start.": "Undercurrent n’a pas démarré.",
    "The log is in ~/Library/Application Support/Undercurrent/app.log.": "Le journal se trouve dans ~/Library/Application Support/Undercurrent/app.log.",
    "Moving your data to its new place…": "Déplacement de vos données à leur nouvel emplacement…",
    "Stopping the local AI…": "Arrêt de l’IA locale…",
    "Reconnecting…": "Reconnexion…",
    "Try again": "Réessayer",
    "About Undercurrent {version}": "À propos d’Undercurrent {version}",
    "Starting Undercurrent in test mode…": "Démarrage d’Undercurrent en mode test…",
    "Test mode": "Mode test",
    "Fake posts and a fake model, nothing explicit, your real data untouched.": "Fausses publications et faux modèle, rien d’explicite, vos vraies données ne sont pas touchées.",
    "Restart in Test Mode": "Redémarrer en mode test",
    "Restart Normally": "Redémarrer normalement",
    "Reset Test Data": "Réinitialiser les données de test",
    "Test": "Test",
    "Check for Updates…": "Rechercher les mises à jour…",
    "Settings…": "Réglages…",
    "Hide Undercurrent": "Masquer Undercurrent",
    "Hide Others": "Masquer les autres",
    "Quit Undercurrent": "Quitter Undercurrent",
    "Edit": "Édition",
    "Undo": "Annuler",
    "Redo": "Rétablir",
    "Cut": "Couper",
    "Copy": "Copier",
    "Paste": "Coller",
    "Select All": "Tout sélectionner",
    "View": "Présentation",
    "Reload": "Recharger",
    "Actual Size": "Taille réelle",
    "Zoom In": "Zoom avant",
    "Zoom Out": "Zoom arrière",
    "Enter Full Screen": "Passer en plein écran",
    "Window": "Fenêtre",
    "Minimize": "Réduire",
    "Zoom": "Zoom"
]

let APP_LANG: String = {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    if let saved = try? String(contentsOf: base.appendingPathComponent("Undercurrent/language"), encoding: .utf8) {
        let l = saved.trimmingCharacters(in: .whitespacesAndNewlines)
        if l == "fr" || l == "en" { return l }
    }
    return (Locale.preferredLanguages.first ?? "en").hasPrefix("fr") ? "fr" : "en"
}()

func L(_ s: String) -> String {
    return APP_LANG == "fr" ? (FRENCH[s] ?? s) : s
}

// Test mode: hold Option while opening Undercurrent (or open it with --test). It runs with fake posts and a fake
// model, nothing explicit, in its own data folder and on its own port, so your real data, feed and Ollama are untouched.
// It is read at the very start, while the key is still held.
let TEST_MODE: Bool = NSEvent.modifierFlags.contains(.option)
    || CommandLine.arguments.contains("--test")
    || ProcessInfo.processInfo.environment["UC_TEST_MODE"] == "1"

let PORT = TEST_MODE ? 4318 : 4317
let BASE = "http://127.0.0.1:\(PORT)"

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var ownServer = false
    var quitting = false
    var loadedApp = false
    // The full screen viewer put the window in full screen (so leaving the viewer takes it out again).
    var fullByViewer = false
    var fullMoving = false
    var leaveAfterMove = false
    var logHandle: FileHandle?

    lazy var mainDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Undercurrent", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    // Test mode keeps everything in a folder of its own inside the data folder.
    lazy var dataDir: URL = {
        guard TEST_MODE else { return mainDir }
        let dir = mainDir.appendingPathComponent("Test mode", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    // The downloaded app carries everything inside it: the code in Resources/app and its own Node in Resources/node.
    lazy var bundledApp: String? = {
        guard let res = Bundle.main.resourcePath else { return nil }
        let p = res + "/app"
        return FileManager.default.fileExists(atPath: p + "/server/src/index.js") ? p : nil
    }()
    var packaged: Bool { bundledApp != nil && installPathOverride == nil }

    // A code folder set by hand in ~/Library/Application Support/Undercurrent/install-path wins (for development).
    lazy var installPathOverride: String? = {
        guard let custom = try? String(contentsOf: mainDir.appendingPathComponent("install-path"), encoding: .utf8) else { return nil }
        let p = custom.trimmingCharacters(in: .whitespacesAndNewlines)
        return FileManager.default.fileExists(atPath: p + "/server/src/index.js") ? p : nil
    }()

    // Where the code is: inside the app when it was downloaded, otherwise the code folder it was built from.
    lazy var installPath: String = {
        if let p = installPathOverride { return p }
        if let p = bundledApp { return p }
        return (Bundle.main.object(forInfoDictionaryKey: "UCInstallPath") as? String) ?? ""
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        applyLookIcon()
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        if #available(macOS 12.3, *) { config.preferences.isElementFullscreenEnabled = true }
        config.websiteDataStore = WKWebsiteDataStore.default()
        // The page knows it is inside the Mac app (room for the window buttons), and its top bar moves the window:
        // drag it anywhere that is not a button or a field, double-click it to zoom, like a normal title bar.
        let bridge = """
        (function () {
          window.ucMac = true;
          var mark = function () { if (document.documentElement) document.documentElement.classList.add('mac-app'); };
          mark(); document.addEventListener('DOMContentLoaded', mark);
          var NO = 'button, a, input, textarea, select, label, summary, video, iframe, [role=button], [role=radio], [contenteditable], .no-drag, .sb-steps, .statuspop, .sb-chips';
          var can = function (e) { return e.button === 0 && e.target && e.target.closest && e.target.closest('.top') && !e.target.closest(NO); };
          document.addEventListener('mousedown', function (e) { if (can(e) && e.detail === 1) window.webkit.messageHandlers.uc.postMessage('drag'); }, true);
          document.addEventListener('dblclick', function (e) { if (can(e)) window.webkit.messageHandlers.uc.postMessage('zoom'); }, true);
        })();
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "uc")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        web.allowsMagnification = true
        web.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Undercurrent"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = look == "cutout" ? NSColor(red: 0.02, green: 0.02, blue: 0.02, alpha: 1) : look == "signal" ? NSColor(red: 0.043, green: 0.043, blue: 0.043, alpha: 1) : look == "specimen" ? NSColor(red: 0.075, green: 0.075, blue: 0.071, alpha: 1) : NSColor(red: 0.067, green: 0.051, blue: 0.071, alpha: 1)
        window.minSize = NSSize(width: 760, height: 560)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName(TEST_MODE ? "UndercurrentTest" : "UndercurrentMain")
        if TEST_MODE {
            window.title = "Undercurrent (" + L("Test mode") + ")"
            NSApp.dockTile.badgeLabel = L("Test")
        }
        window.makeKeyAndOrderFront(nil)
        watchFullScreen()
        NSApp.activate(ignoringOtherApps: true)

        showSplash(TEST_MODE ? L("Starting Undercurrent in test mode…") : L("Starting Undercurrent…"))
        if !TEST_MODE { keepOllamaHidden() }
        DispatchQueue.global(qos: .userInitiated).async {
            self.moveOldData()
            if self.serverUp() {
                DispatchQueue.main.async { self.waitAndLoad() }
            } else {
                DispatchQueue.main.async { self.startServer() }
            }
        }
    }

    // ---------- Moving the window from the page's top bar ----------

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let what = message.body as? String else { return }
        if what == "zoom" { window.performZoom(nil); return }
        // While a video is full screen in the page, pinching zooms the video, not the whole window.
        if what == "pinch-off" { web.allowsMagnification = false; return }
        if what == "pinch-on" { web.allowsMagnification = true; return }
        if what == "winfull-on" { viewerFull(true); return }
        if what == "winfull-off" { viewerFull(false); return }
        if what == "drag" { dragWindow() }
        // The look changed: remembered for the loading screens, and the Dock icon follows it.
        if what.hasPrefix("look:") {
            let l = String(what.dropFirst(5))
            if LOOKS.contains(l) && l != look { UserDefaults.standard.set(l, forKey: "look"); applyLookIcon() }
            return
        }
        // The look changed: the window's own background follows the page's.
        if what.hasPrefix("bg:#"), what.count == 10, let v = UInt32(what.dropFirst(4), radix: 16) {
            window.backgroundColor = NSColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        }
    }

    // ---------- Full screen with the full screen viewer ----------

    func isFull() -> Bool { window.styleMask.contains(.fullScreen) }

    func viewerFull(_ on: Bool) {
        if on {
            leaveAfterMove = false
            if isFull() || fullByViewer { return }
            fullByViewer = true
            window.toggleFullScreen(nil)
        } else {
            guard fullByViewer else { return }
            if fullMoving { leaveAfterMove = true; return }
            fullByViewer = false
            if isFull() { window.toggleFullScreen(nil) }
        }
    }

    func watchFullScreen() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: NSWindow.willEnterFullScreenNotification, object: window, queue: .main) { [weak self] _ in self?.fullMoving = true }
        nc.addObserver(forName: NSWindow.didEnterFullScreenNotification, object: window, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            self.fullMoving = false
            if self.leaveAfterMove { self.leaveAfterMove = false; self.fullByViewer = false; self.window.toggleFullScreen(nil) }
        }
        nc.addObserver(forName: NSWindow.willExitFullScreenNotification, object: window, queue: .main) { [weak self] _ in self?.fullMoving = true }
        nc.addObserver(forName: NSWindow.didExitFullScreenNotification, object: window, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            self.fullMoving = false
            // You left full screen yourself while the viewer was open: the viewer closes too.
            if self.fullByViewer {
                self.fullByViewer = false
                self.web.evaluateJavaScript("window.ucWinFullLeft && window.ucWinFullLeft()", completionHandler: nil)
            }
        }
    }

    func dragWindow() {
        if let e = NSApp.currentEvent, e.type == .leftMouseDown || e.type == .leftMouseDragged {
            window.performDrag(with: e)
            return
        }
        // The click already went by: follow the mouse until it is released.
        guard NSEvent.pressedMouseButtons & 1 == 1 else { return }
        let start = NSEvent.mouseLocation
        let origin = window.frame.origin
        while true {
            guard let e = window.nextEvent(matching: [.leftMouseDragged, .leftMouseUp], until: .distantFuture, inMode: .eventTracking, dequeue: true) else { break }
            if e.type == .leftMouseUp { break }
            let p = NSEvent.mouseLocation
            window.setFrameOrigin(NSPoint(x: origin.x + p.x - start.x, y: origin.y + p.y - start.y))
        }
    }

    // ---------- Ollama stays in the background ----------

    // Ollama is started for the models only: when its app opens a window while Undercurrent starts, it is hidden again
    // and Undercurrent stays in front.
    let startedAt = Date()
    func isOllama(_ app: NSRunningApplication) -> Bool {
        return (app.bundleIdentifier ?? "").lowercased().contains("ollama") || app.localizedName == "Ollama"
    }

    func keepOllamaHidden() {
        let center = NSWorkspace.shared.notificationCenter
        for app in NSWorkspace.shared.runningApplications where isOllama(app) && app.isActive { app.hide() }
        center.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { [weak self] n in
            guard let self = self, let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, self.isOllama(app) else { return }
            app.hide()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { app.hide() }
            NSApp.activate(ignoringOtherApps: true)
        }
        center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] n in
            guard let self = self, Date().timeIntervalSince(self.startedAt) < 120,
                  let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, self.isOllama(app) else { return }
            app.hide()
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    // ---------- The server ----------

    func nodePath() -> String? {
        let fm = FileManager.default
        var candidates: [String] = []
        if packaged, let res = Bundle.main.resourcePath { candidates.append(res + "/node/node") }
        if let p = Bundle.main.object(forInfoDictionaryKey: "UCNodePath") as? String { candidates.append(p) }
        let nvm = NSHomeDirectory() + "/.nvm/versions/node"
        if let versions = try? fm.contentsOfDirectory(atPath: nvm) {
            for v in versions.sorted(by: { $0.compare($1, options: .numeric) == .orderedDescending }) { candidates.append("\(nvm)/\(v)/bin/node") }
        }
        candidates += ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
        return candidates.first { fm.isExecutableFile(atPath: $0) }
    }

    func startServer() {
        guard !installPath.isEmpty, FileManager.default.fileExists(atPath: installPath + "/server/src/index.js") else {
            showError(L("Parts of Undercurrent are missing."), detail: L("Download Undercurrent again from github.com/mabuxi/undercurrent and replace this copy. Your data is kept."))
            return
        }
        guard let node = nodePath() else {
            showError(L("Node.js was not found."), detail: L("Undercurrent needs Node.js 22 or newer. Install it from nodejs.org, then open Undercurrent again."))
            return
        }
        if !FileManager.default.fileExists(atPath: installPath + "/web/dist/index.html") {
            showSplash(L("Preparing the app for the first time…"))
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: node)
        // Settings for the server can go in a .env file: next to the code, or in the data folder for the downloaded app.
        p.arguments = ["--env-file-if-exists=\(packaged ? dataDir.path : installPath)/.env", "\(installPath)/server/src/index.js"]
        p.currentDirectoryURL = URL(fileURLWithPath: installPath + "/server")
        var env = ProcessInfo.processInfo.environment
        env["UC_APP"] = "1"
        env["UC_DATA_DIR"] = dataDir.path
        env["PORT"] = String(PORT)
        if TEST_MODE {
            env["MOCK"] = "1"
            env["UC_TEST_MODE"] = "1"
            env["UC_LANGUAGE"] = APP_LANG
        }
        if packaged {
            env["UC_PACKAGED"] = "1"
            env["UC_APP_BUNDLE"] = Bundle.main.bundlePath
        }
        env["PATH"] = (node as NSString).deletingLastPathComponent + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        p.environment = env
        let logURL = dataDir.appendingPathComponent("app.log")
        if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
        logHandle = try? FileHandle(forWritingTo: logURL)
        logHandle?.seekToEndOfFile()
        if let h = logHandle { p.standardOutput = h; p.standardError = h }
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async { self?.serverStopped(code: proc.terminationStatus) }
        }
        do {
            try p.run()
            server = p
            ownServer = true
            waitAndLoad()
        } catch {
            showError(L("Undercurrent could not start."), detail: error.localizedDescription)
        }
    }

    // 75 means "updated, start me again on the new code".
    func serverStopped(code: Int32) {
        server = nil
        if quitting { return }
        if code == 75 {
            loadedApp = false
            showSplash(L("Finishing the update…"))
            startServer()
            return
        }
        // 76: the app itself was replaced by a new version. Quit and open the new one.
        if code == 76 {
            showSplash(L("Opening the new version…"))
            relaunch()
            return
        }
        showError(L("Undercurrent stopped unexpectedly."), detail: L("Exit code {code}. The log is in ~/Library/Application Support/Undercurrent/app.log.").replacingOccurrences(of: "{code}", with: String(code)))
    }

    // Opens the app again once this one has quit: as it was, in test mode, or normally. A reset also clears the
    // test data folder in between.
    func relaunch(test: Bool = TEST_MODE, resetTest: Bool = false) {
        let path = Bundle.main.bundlePath
        let pid = ProcessInfo.processInfo.processIdentifier
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        let wipe = resetTest ? "rm -rf \"$1\"; " : ""
        let open = test ? "/usr/bin/open -n \"$0\" --args --test" : "/usr/bin/open \"$0\""
        p.arguments = ["-c", "while kill -0 \(pid) 2>/dev/null; do sleep 0.2; done; sleep 0.5; \(wipe)\(open)", path, mainDir.appendingPathComponent("Test mode").path]
        try? p.run()
        quitting = true
        NSApp.terminate(nil)
    }

    func serverUp() -> Bool {
        guard let url = URL(string: BASE + "/api/status") else { return false }
        var req = URLRequest(url: url)
        req.timeoutInterval = 1.5
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            ok = (resp as? HTTPURLResponse)?.statusCode == 200
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 2)
        return ok
    }

    func waitAndLoad(attempt: Int = 0) {
        DispatchQueue.global().async {
            let up = self.serverUp()
            DispatchQueue.main.async {
                if up {
                    self.loadedApp = true
                    self.web.load(URLRequest(url: URL(string: BASE + "/")!))
                } else if attempt < 240 && !self.quitting {
                    if attempt == 20 { self.showSplash(L("Still starting… the first start can take a minute.")) }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.waitAndLoad(attempt: attempt + 1) }
                } else if !self.quitting {
                    self.showError(L("Undercurrent did not start."), detail: L("The log is in ~/Library/Application Support/Undercurrent/app.log."))
                }
            }
        }
    }

    // Data used to live next to the code (data/undercurrent.db). It is copied once to Application Support;
    // the old copy stays where it was as a backup.
    func moveOldData() {
        let fm = FileManager.default
        let target = dataDir.appendingPathComponent("undercurrent.db")
        let old = installPath + "/data/undercurrent.db"
        guard !packaged, !TEST_MODE, !fm.fileExists(atPath: target.path), fm.fileExists(atPath: old) else { return }
        DispatchQueue.main.async { self.showSplash(L("Moving your data to its new place…")) }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/sqlite3")
        p.arguments = [old, ".backup '\(target.path)'"]
        try? p.run()
        p.waitUntilExit()
        if p.terminationStatus != 0 { try? fm.copyItem(atPath: old, toPath: target.path) }
    }

    // ---------- Quitting: the server, the models and Ollama go with the app ----------

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let p = server, p.isRunning, ownServer else { return .terminateNow }
        quitting = true
        showSplash(L("Stopping the local AI…"))
        p.terminate()
        DispatchQueue.global().async {
            let deadline = Date().addingTimeInterval(15)
            while p.isRunning && Date() < deadline { usleep(100_000) }
            if p.isRunning { kill(p.processIdentifier, SIGKILL) }
            DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // ---------- Web view ----------

    // Links to other sites open in your browser; the app itself and video players stay inside.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.allow) }
        let local = url.host == "127.0.0.1" || url.host == "localhost" || url.scheme == "about" || url.scheme == "data" || url.scheme == "blob"
        let mainFrame = action.targetFrame?.isMainFrame ?? true
        if !local && mainFrame && (url.scheme == "http" || url.scheme == "https") {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, action.targetFrame == nil, action.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if loadedApp && !quitting { loadedApp = false; showSplash(L("Reconnecting…")); waitAndLoad() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // ---------- The look (original, Cutout, Signal or Specimen) ----------

    let LOOKS = ["original", "cutout", "signal", "specimen"]
    var look: String { let l = UserDefaults.standard.string(forKey: "look") ?? "original"; return LOOKS.contains(l) ? l : "original" }

    // The Dock icon of the look (the original look keeps the app's own icon).
    func applyLookIcon() {
        let l = look
        if l == "original" { NSApp.applicationIconImage = nil; return }
        if let img = NSImage(contentsOfFile: installPath + "/web/dist/icons/mac-\(l).png") { NSApp.applicationIconImage = img }
    }

    // The fonts of the looks, from the built app, so the loading screen uses the same type as the page.
    // extra adds to the face, for a variable font (its range of weights and widths).
    func fontFace(_ family: String, _ prefix: String, _ weight: Int, _ extra: String = "") -> String {
        let dir = installPath + "/web/dist/assets"
        guard let name = (try? FileManager.default.contentsOfDirectory(atPath: dir))?.first(where: { $0.hasPrefix(prefix) && $0.hasSuffix(".woff2") }),
              let data = FileManager.default.contents(atPath: dir + "/" + name) else { return "" }
        return "@font-face{font-family:'\(family)';font-weight:\(weight);\(extra)src:url(data:font/woff2;base64,\(data.base64EncodedString())) format('woff2')}"
    }
    lazy var lookFonts: [String: String] = [
        "cutout": fontFace("Unbounded", "unbounded-latin-800-normal", 800) + fontFace("Manrope", "manrope-latin-600-normal", 600) + fontFace("Manrope", "manrope-latin-700-normal", 700),
        "signal": fontFace("Big Shoulders Display", "big-shoulders-display-latin-900-normal", 900) + fontFace("Space Mono", "space-mono-latin-400-normal", 400) + fontFace("Space Mono", "space-mono-latin-700-normal", 700),
        "specimen": fontFace("Anybody", "anybody-latin-wdth-normal", 900, "font-weight:100 900;font-stretch:50% 150%;") + fontFace("Archivo", "archivo-latin-wdth-normal", 400, "font-weight:100 900;font-stretch:62% 125%;") + fontFace("Martian Mono", "martian-mono-latin-400-normal", 400)
    ]

    // The mark of each look (the same drawings as web/src/logo.js).
    let LOGO: [String: String] = [
        "original": """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="ob" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B2030"/><stop offset="1" stop-color="#140F17"/></linearGradient><linearGradient id="ow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F6D5C9"/><stop offset=".4" stop-color="#E39A83"/><stop offset=".75" stop-color="#C98BC4"/><stop offset="1" stop-color="#A58FE0"/></linearGradient><filter id="og" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><rect width="100" height="100" rx="23" fill="url(#ob)"/><g fill="none" stroke-linecap="round"><path d="M24 33q13-7 26 0t26 0" stroke="#8E7684" stroke-width="3" opacity=".7"/><path d="M19 45q15-8 31 0t31 0" stroke="#B88F8A" stroke-width="4" opacity=".85"/><path d="M15 59q17-9 35 0t35 0" stroke="url(#ow)" stroke-width="7" filter="url(#og)" opacity=".75"/><path d="M15 59q17-9 35 0t35 0" stroke="url(#ow)" stroke-width="6.5"/><path d="M22 72q14-7 28 0t28 0" stroke="#7E6874" stroke-width="3" opacity=".7"/></g></svg>
""",
        "cutout": """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#050505"/><path d="M10 28Q10 10 28 10H50Q58 10 58.5 18A20 20 0 0 0 82 41.5Q90 42 90 50V72Q90 90 72 90H28Q10 90 10 72Z" fill="#C8FF1E"/><circle cx="78" cy="22" r="9" fill="#FF4FA0"/><g fill="none" stroke="#0B0B0B" stroke-linecap="round"><path d="M20 52q10-7 20 0t20 0t20 0" stroke-width="7.5"/><path d="M20 70q10-7 20 0t20 0t20 0" stroke-width="7.5"/></g></svg>
""",
        "signal": """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="sd" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#0B0B0B"/><circle cx="1" cy="1" r=".9" fill="#34332D"/></pattern><pattern id="ss" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#D4FF3A"/><rect width="2.2" height="6" fill="#0B0B0B" opacity=".9"/></pattern></defs><rect width="100" height="100" rx="20" fill="url(#sd)"/><g transform="rotate(-7 50 50)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 42q11-10 22 0t22 0t22 0" stroke="#FF5CA8" stroke-width="15" transform="translate(4 4)"/><path d="M17 42q11-10 22 0t22 0t22 0" stroke="#F3F0E4" stroke-width="15"/><path d="M17 42q11-10 22 0t22 0t22 0" stroke="url(#ss)" stroke-width="9"/><path d="M17 66q11-10 22 0t22 0t22 0" stroke="#3B82FF" stroke-width="15" transform="translate(4 4)"/><path d="M17 66q11-10 22 0t22 0t22 0" stroke="#F3F0E4" stroke-width="15"/><path d="M17 66q11-10 22 0t22 0t22 0" stroke="#FF5CA8" stroke-width="9"/></g></svg>
""",
        "specimen": """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#131312"/><path d="M20 0V100M0 20H100" stroke="#1F1E1C" stroke-width="1"/><path d="M40 0V100M0 40H100" stroke="#1F1E1C" stroke-width="1"/><path d="M60 0V100M0 60H100" stroke="#1F1E1C" stroke-width="1"/><path d="M80 0V100M0 80H100" stroke="#1F1E1C" stroke-width="1"/><g fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(-4 4)"><path d="M16 44q10.5-9 21 0t21 0t21 0" transform="translate(10.4 -8.8)" stroke="#ECE8E0" stroke-width="1.43" opacity="0.3"/><path d="M16 44q10.5-9 21 0t21 0t21 0" transform="translate(7.8 -6.6)" stroke="#ECE8E0" stroke-width="1.43" opacity="0.4"/><path d="M16 44q10.5-9 21 0t21 0t21 0" transform="translate(5.2 -4.4)" stroke="#ECE8E0" stroke-width="1.43" opacity="0.5"/><path d="M16 44q10.5-9 21 0t21 0t21 0" transform="translate(2.6 -2.2)" stroke="#ECE8E0" stroke-width="1.43" opacity="0.6"/><path d="M16 44q10.5-9 21 0t21 0t21 0" transform="translate(0.0 -0.0)" stroke="#ECE8E0" stroke-width="2.60" opacity="1"/><path d="M16 66q10.5-9 21 0t21 0t21 0" transform="translate(15.6 -13.2)" stroke="#FF2E7E" stroke-width="1.87" opacity="0.27"/><path d="M16 66q10.5-9 21 0t21 0t21 0" transform="translate(13.0 -11.0)" stroke="#FF2E7E" stroke-width="1.87" opacity="0.34"/><path d="M16 66q10.5-9 21 0t21 0t21 0" transform="translate(10.4 -8.8)" stroke="#FF2E7E" stroke-width="1.87" opacity="0.41"/><path d="M16 66q10.5-9 21 0t21 0t21 0" transform="translate(7.8 -6.6)" stroke="#FF2E7E" stroke-width="1.87" opacity="0.49"/><path d="M16 66q10.5-9 21 0t21 0t21 0" transform="translate(5.2 -4.4)" stroke="#FF2E7E" stroke-width="1.87" opacity="0.56"/><path d="M16 66q10.5-9 21 0t21 0t21 0" transform="translate(2.6 -2.2)" stroke="#FF2E7E" stroke-width="1.87" opacity="0.63"/><path d="M16 66q10.5-9 21 0t21 0t21 0" transform="translate(0.0 -0.0)" stroke="#FF2E7E" stroke-width="3.40" opacity="1"/></g><rect x="13" y="76" width="6" height="6" fill="#FF2E7E"/><rect x="83" y="22" width="5" height="5" fill="#ECE8E0"/></svg>
"""
    ]

    let LOOK_CSS: [String: String] = [
        "original": """
        html,body{background:#110D12;color:#EFE6EA;font:14px -apple-system,system-ui,sans-serif}
        .t{font:600 11px -apple-system,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#E8C66B;border:1px solid rgba(232,198,107,.45);border-radius:999px;padding:4px 10px}
        h1{font:italic 64px 'Instrument Serif',Georgia,serif;margin:0;background:linear-gradient(100deg,#F6D5C9,#E39A83 40%,#C98BC4 75%,#A58FE0);-webkit-background-clip:text;color:transparent}
        p{color:#B6A8B0}
        .m{filter:drop-shadow(0 18px 36px rgba(227,154,131,.28));animation:mb 1.8s ease-in-out infinite}
        @keyframes mb{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        .s{width:28px;height:28px;border-radius:50%;border:3px solid rgba(227,154,131,.25);border-top-color:#E39A83;animation:r 0.9s linear infinite}
        button{padding:10px 18px;border-radius:999px;background:linear-gradient(100deg,#E39A83,#C98BC4);color:#1C0F14;font-weight:600}
        """,
        "cutout": """
        html,body{background:#050505;color:#F4F4F0;font:600 14px 'Manrope',-apple-system,sans-serif}
        .t{font:700 11px 'Manrope',-apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#0B0B0B;background:#C8FF1E;border-radius:999px;padding:5px 12px}
        h1{font:800 46px 'Unbounded',-apple-system,sans-serif;letter-spacing:-.035em;margin:0;color:#F4F4F0}
        p{color:#A3A39B}
        .m{filter:drop-shadow(0 20px 40px rgba(200,255,30,.25));animation:cb 1.1s cubic-bezier(.34,1.56,.64,1) infinite alternate}
        @keyframes cb{from{transform:translateY(4px) scale(.97)}to{transform:translateY(-8px) scale(1.03)}}
        .s{width:84px;height:8px;border-radius:4px;background:linear-gradient(90deg,#C8FF1E,#C8FF1E) 0 0/40% 100% no-repeat,#1A1A1A;animation:cs 1.2s ease-in-out infinite}
        @keyframes cs{0%{background-position:-70% 0,0 0}100%{background-position:170% 0,0 0}}
        button{padding:12px 20px;border-radius:999px;background:#C8FF1E;color:#0B0B0B;font-weight:700;box-shadow:0 10px 24px -10px #C8FF1E}
        """,
        "signal": """
        html,body{background:#0B0B0B;color:#F3F0E4;font:400 13px 'Space Mono',Menlo,monospace}
        body{background:radial-gradient(circle 1px at 1px 1px,#2A2925 98%,transparent) 0 0/22px 22px,#0B0B0B}
        .t{font:700 11px 'Space Mono',Menlo,monospace;text-transform:uppercase;color:#0B0B0B;background:#D4FF3A;border:2px solid #0B0B0B;border-radius:5px;padding:3px 9px;transform:rotate(-3deg);box-shadow:3px 3px 0 #F3F0E4}
        h1{font:900 66px 'Big Shoulders Display','Arial Narrow',sans-serif;text-transform:uppercase;letter-spacing:.01em;line-height:.9;margin:0;color:#F3F0E4}
        p{color:#C9C4B4}
        .m svg{border-radius:20px;box-shadow:6px 6px 0 #FF5CA8}
        .m{animation:st 1.2s steps(1) infinite}
        @keyframes st{0%{transform:rotate(-6deg)}50%{transform:rotate(4deg) scale(1.04)}}
        .s{width:96px;height:12px;border:2px solid #F3F0E4;border-radius:3px;background:repeating-linear-gradient(-45deg,#D4FF3A 0 6px,#0B0B0B 6px 10px);background-size:28px 100%;animation:ss .6s linear infinite}
        @keyframes ss{to{background-position:28px 0}}
        button{padding:9px 18px;border-radius:10px;background:#D4FF3A;color:#0B0B0B;border:2px solid #0B0B0B;box-shadow:4px 4px 0 #FF5CA8;font:900 18px 'Big Shoulders Display','Arial Narrow',sans-serif;text-transform:uppercase}
        """,
        "specimen": """
        html,body{background:#131312;color:#ECE8E0;font:420 14px 'Archivo',-apple-system,sans-serif}
        body{background:linear-gradient(90deg,#1E1D1B 1px,transparent 1px) 0 0/120px 100%,linear-gradient(0deg,#1E1D1B 1px,transparent 1px) 0 0/100% 120px,linear-gradient(90deg,#181816 1px,transparent 1px) 0 0/24px 100%,linear-gradient(0deg,#181816 1px,transparent 1px) 0 0/100% 24px,#131312}
        .t{font:400 10.5px 'Martian Mono',Menlo,monospace;color:#FF2E7E;border:1px solid #FF2E7E;padding:4px 10px}
        h1{font-family:'Anybody',-apple-system,sans-serif;font-weight:900;font-stretch:150%;font-size:48px;letter-spacing:-.045em;line-height:.95;margin:0;color:#ECE8E0}
        p{color:#A6A29A;font-size:13px}
        .m{animation:sd 1.6s steps(6) infinite}
        @keyframes sd{0%{clip-path:inset(0 100% 0 0)}60%,100%{clip-path:inset(0 0 0 0)}}
        .s{width:96px;height:9px;background:linear-gradient(0deg,transparent 3px,#FF2E7E 3px 6px,transparent 6px) 0 0/30% 100% no-repeat,repeating-linear-gradient(90deg,#4A4844 0 1px,transparent 1px 10%);animation:sr 1.1s steps(10) infinite}
        @keyframes sr{to{background-position:140% 0,0 0}}
        button{padding:10px 18px;background:#FF2E7E;color:#131312;font-family:'Anybody',-apple-system,sans-serif;font-weight:800;font-stretch:118%;font-size:13px}
        """
    ]

    // ---------- Screens while the app is not there ----------

    func page(_ body: String) -> String {
        let l = look
        return """
        <html><head><meta charset="utf-8"><style>
        \(lookFonts[l] ?? "")
        html,body{margin:0;height:100%;-webkit-user-select:none}
        .c{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:0 40px}
        p{margin:0;max-width:520px;line-height:1.5}
        .m{width:92px;height:92px}
        .m svg{width:100%;height:100%;display:block}
        @keyframes r{to{transform:rotate(360deg)}}
        button{all:unset;cursor:pointer}
        \(LOOK_CSS[l] ?? "")
        button{cursor:pointer}
        </style></head><body><div class="c"><div class="m">\(LOGO[l] ?? "")</div>\(body)</div></body></html>
        """
    }

    var testTag: String { TEST_MODE ? "<span class=\"t\">\(L("Test mode"))</span>" : "" }

    func showSplash(_ text: String) {
        let note = TEST_MODE ? "<p>\(L("Fake posts and a fake model, nothing explicit, your real data untouched."))</p>" : ""
        web.loadHTMLString(page("<h1>Undercurrent</h1>\(testTag)<div class=\"s\"></div><p>\(text)</p>\(note)"), baseURL: nil)
    }

    func showError(_ title: String, detail: String) {
        web.loadHTMLString(page("<h1>Undercurrent</h1><p><b>\(title)</b></p><p>\(detail)</p><button onclick=\"location.href='undercurrent://retry'\">\(L("Try again"))</button>"), baseURL: nil)
        retryArmed = true
    }

    var retryArmed = false
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        if action.request.url?.scheme == "undercurrent" {
            decisionHandler(.cancel, preferences)
            if retryArmed { retryArmed = false; showSplash(L("Starting Undercurrent…")); if serverUp() { waitAndLoad() } else { startServer() } }
            return
        }
        self.webView(webView, decidePolicyFor: action) { policy in decisionHandler(policy, preferences) }
    }

    // ---------- Menus ----------

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        main.addItem(appItem)
        let app = NSMenu()
        let version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? ""
        app.addItem(withTitle: L("About Undercurrent {version}").replacingOccurrences(of: "{version}", with: version), action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(withTitle: L("Check for Updates…"), action: #selector(checkUpdates), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: L("Settings…"), action: #selector(openSettings), keyEquivalent: ",")
        app.addItem(.separator())
        if TEST_MODE {
            app.addItem(withTitle: L("Restart Normally"), action: #selector(restartNormal), keyEquivalent: "")
            app.addItem(withTitle: L("Reset Test Data"), action: #selector(resetTestData), keyEquivalent: "")
        } else {
            app.addItem(withTitle: L("Restart in Test Mode"), action: #selector(restartTest), keyEquivalent: "")
        }
        app.addItem(.separator())
        app.addItem(withTitle: L("Hide Undercurrent"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = app.addItem(withTitle: L("Hide Others"), action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        app.addItem(.separator())
        app.addItem(withTitle: L("Quit Undercurrent"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = app

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let edit = NSMenu(title: L("Edit"))
        edit.addItem(withTitle: L("Undo"), action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: L("Redo"), action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: L("Cut"), action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: L("Copy"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: L("Paste"), action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: L("Select All"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let viewItem = NSMenuItem()
        main.addItem(viewItem)
        let view = NSMenu(title: L("View"))
        view.addItem(withTitle: L("Reload"), action: #selector(reload), keyEquivalent: "r")
        view.addItem(.separator())
        view.addItem(withTitle: L("Actual Size"), action: #selector(zoomReset), keyEquivalent: "0")
        view.addItem(withTitle: L("Zoom In"), action: #selector(zoomIn), keyEquivalent: "+")
        view.addItem(withTitle: L("Zoom Out"), action: #selector(zoomOut), keyEquivalent: "-")
        view.addItem(.separator())
        let fs = view.addItem(withTitle: L("Enter Full Screen"), action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view

        let winItem = NSMenuItem()
        main.addItem(winItem)
        let win = NSMenu(title: L("Window"))
        win.addItem(withTitle: L("Minimize"), action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: L("Zoom"), action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        winItem.submenu = win
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }

    @objc func reload() { if loadedApp { web.reload() } else { waitAndLoad() } }
    @objc func zoomIn() { web.pageZoom = min(2, web.pageZoom + 0.1) }
    @objc func zoomOut() { web.pageZoom = max(0.5, web.pageZoom - 0.1) }
    @objc func zoomReset() { web.pageZoom = 1 }
    @objc func openSettings() { web.evaluateJavaScript("window.ucOpen && window.ucOpen('settings')", completionHandler: nil) }
    @objc func checkUpdates() { web.evaluateJavaScript("window.ucOpen && window.ucOpen('updates')", completionHandler: nil) }
    @objc func restartTest() { relaunch(test: true) }
    @objc func restartNormal() { relaunch(test: false) }
    @objc func resetTestData() { relaunch(test: true, resetTest: true) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
