import Cocoa
import WebKit

// Undercurrent for Mac: a window around the local web app. It starts the Undercurrent server (which starts the local
// AI models), shows the app when it is ready, and when you quit, it stops the server, unloads the models and quits
// Ollama. Your data lives in ~/Library/Application Support/Undercurrent, apart from the code, so updates never touch it.

let PORT = 4317
let BASE = "http://127.0.0.1:\(PORT)"

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var ownServer = false
    var quitting = false
    var loadedApp = false
    var logHandle: FileHandle?

    lazy var dataDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Undercurrent", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    // Where the code is: set when the app was built, can be changed in ~/Library/Application Support/Undercurrent/install-path.
    lazy var installPath: String = {
        if let custom = try? String(contentsOf: dataDir.appendingPathComponent("install-path"), encoding: .utf8) {
            let p = custom.trimmingCharacters(in: .whitespacesAndNewlines)
            if FileManager.default.fileExists(atPath: p + "/server/src/index.js") { return p }
        }
        return (Bundle.main.object(forInfoDictionaryKey: "UCInstallPath") as? String) ?? ""
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        if #available(macOS 12.3, *) { config.preferences.isElementFullscreenEnabled = true }
        config.websiteDataStore = WKWebsiteDataStore.default()
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
        window.backgroundColor = NSColor(red: 0.067, green: 0.051, blue: 0.071, alpha: 1)
        window.minSize = NSSize(width: 760, height: 560)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("UndercurrentMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        showSplash("Starting Undercurrent…")
        DispatchQueue.global(qos: .userInitiated).async {
            self.moveOldData()
            if self.serverUp() {
                DispatchQueue.main.async { self.waitAndLoad() }
            } else {
                DispatchQueue.main.async { self.startServer() }
            }
        }
    }

    // ---------- The server ----------

    func nodePath() -> String? {
        let fm = FileManager.default
        var candidates: [String] = []
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
            showError("Undercurrent's code folder was not found.", detail: "Expected it at \(installPath). Build the app again from the code folder (mac/build.sh --install).")
            return
        }
        guard let node = nodePath() else {
            showError("Node.js was not found.", detail: "Undercurrent needs Node.js 22 or newer. Install it from nodejs.org, then open Undercurrent again.")
            return
        }
        if !FileManager.default.fileExists(atPath: installPath + "/web/dist/index.html") {
            showSplash("Preparing the app for the first time…")
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: node)
        p.arguments = ["--env-file-if-exists=\(installPath)/.env", "\(installPath)/server/src/index.js"]
        p.currentDirectoryURL = URL(fileURLWithPath: installPath + "/server")
        var env = ProcessInfo.processInfo.environment
        env["UC_APP"] = "1"
        env["UC_DATA_DIR"] = dataDir.path
        env["PORT"] = String(PORT)
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
            showError("Undercurrent could not start.", detail: error.localizedDescription)
        }
    }

    // 75 means "updated, start me again on the new code".
    func serverStopped(code: Int32) {
        server = nil
        if quitting { return }
        if code == 75 {
            loadedApp = false
            showSplash("Finishing the update…")
            startServer()
            return
        }
        showError("Undercurrent stopped unexpectedly.", detail: "Exit code \(code). The log is in ~/Library/Application Support/Undercurrent/app.log.")
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
                    if attempt == 20 { self.showSplash("Still starting… the first start can take a minute.") }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.waitAndLoad(attempt: attempt + 1) }
                } else if !self.quitting {
                    self.showError("Undercurrent did not start.", detail: "The log is in ~/Library/Application Support/Undercurrent/app.log.")
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
        guard !fm.fileExists(atPath: target.path), fm.fileExists(atPath: old) else { return }
        DispatchQueue.main.async { self.showSplash("Moving your data to its new place…") }
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
        showSplash("Stopping the local AI…")
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
        if loadedApp && !quitting { loadedApp = false; showSplash("Reconnecting…"); waitAndLoad() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // ---------- Screens while the app is not there ----------

    func page(_ body: String) -> String {
        return """
        <html><head><meta charset="utf-8"><style>
        html,body{margin:0;height:100%;background:#110D12;color:#EFE6EA;font:14px -apple-system,system-ui,sans-serif;-webkit-user-select:none}
        .c{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:0 40px}
        h1{font:italic 64px 'Instrument Serif',Georgia,serif;margin:0;background:linear-gradient(100deg,#F6D5C9,#E39A83 40%,#C98BC4 75%,#A58FE0);-webkit-background-clip:text;color:transparent}
        p{color:#B6A8B0;margin:0;max-width:520px;line-height:1.5}
        .s{width:28px;height:28px;border-radius:50%;border:3px solid rgba(227,154,131,.25);border-top-color:#E39A83;animation:r 0.9s linear infinite}
        @keyframes r{to{transform:rotate(360deg)}}
        button{all:unset;cursor:pointer;padding:10px 18px;border-radius:999px;background:linear-gradient(100deg,#E39A83,#C98BC4);color:#1C0F14;font-weight:600}
        </style></head><body><div class="c">\(body)</div></body></html>
        """
    }

    func showSplash(_ text: String) {
        web.loadHTMLString(page("<h1>Undercurrent</h1><div class=\"s\"></div><p>\(text)</p>"), baseURL: nil)
    }

    func showError(_ title: String, detail: String) {
        web.loadHTMLString(page("<h1>Undercurrent</h1><p><b>\(title)</b></p><p>\(detail)</p><button onclick=\"location.href='undercurrent://retry'\">Try again</button>"), baseURL: nil)
        retryArmed = true
    }

    var retryArmed = false
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        if action.request.url?.scheme == "undercurrent" {
            decisionHandler(.cancel, preferences)
            if retryArmed { retryArmed = false; showSplash("Starting Undercurrent…"); if serverUp() { waitAndLoad() } else { startServer() } }
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
        app.addItem(withTitle: "About Undercurrent \(version)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(withTitle: "Check for Updates…", action: #selector(checkUpdates), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Settings…", action: #selector(openSettings), keyEquivalent: ",")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide Undercurrent", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = app.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        app.addItem(.separator())
        app.addItem(withTitle: "Quit Undercurrent", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = app

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let viewItem = NSMenuItem()
        main.addItem(viewItem)
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        view.addItem(.separator())
        view.addItem(withTitle: "Actual Size", action: #selector(zoomReset), keyEquivalent: "0")
        view.addItem(withTitle: "Zoom In", action: #selector(zoomIn), keyEquivalent: "+")
        view.addItem(withTitle: "Zoom Out", action: #selector(zoomOut), keyEquivalent: "-")
        view.addItem(.separator())
        let fs = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view

        let winItem = NSMenuItem()
        main.addItem(winItem)
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
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
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
