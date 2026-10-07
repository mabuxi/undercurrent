# Undercurrent

A private Mac app that turns many adult sources into one feed tuned to exactly what you're into. Local AI models tag every post and look at the pictures, your taste is learned from what you heat, like and save, and your kinks build themselves on a map you can edit. Everything about you stays on your Mac.

Current version: see [CHANGELOG.md](CHANGELOG.md).

## Install on a Mac

Undercurrent is a normal Mac app. Nothing has to be installed first: Node.js is inside the app, and on the first start the app installs Ollama and downloads the AI models that fit your Mac, with progress. It runs on Apple Silicon and Intel Macs with macOS 13 or newer.

**The quickest way:** open Terminal and paste this line. It downloads the newest version into Applications and opens it.

```bash
curl -fsSL https://raw.githubusercontent.com/mabuxi/undercurrent/main/install.sh | bash
```

**Or download it:** on the [Releases page](https://github.com/mabuxi/undercurrent/releases/latest), download **Undercurrent.dmg**, open it and drag Undercurrent into Applications. The app is not signed with a paid Apple developer certificate, so the first time macOS says it cannot verify it. Click Done, then open System Settings, Privacy and Security, scroll down and click **Open Anyway** next to Undercurrent. You only do this once; updates open normally.

The first time, the welcome steps walk you through the local AI, who you want to see, your kinks, fantasies, sources and hard limits.

Quitting the app (⌘Q, or closing its window) stops the server, unloads the models and quits Ollama.

## On your iPhone

Click the phone button at the top of the Mac app and scan the QR code with the iPhone camera (same Wi-Fi). Undercurrent opens in Safari, running on the Mac: same feed, same taste, same local AI. Tap Share, Add to Home Screen to keep it as a full-screen app. The code is a pairing key, so only devices that scanned it get in; "Forget all paired phones" makes a new one. On a phone the views are a tab bar at the bottom and the feed snaps from post to post.

Over plain http on a home network iOS does not allow offline caching (service workers need https), so the phone app needs the Mac and Undercurrent to be on.

## Languages

Undercurrent speaks English and French: Settings, Language, or the switch on the first welcome step (the first start follows your Mac's language). Kink names, the assistant and every message follow the language; tags stay in English so what you like counts the same in both. Searching in French also searches the English words the sources use. Posts in another language get a Translate button (and a small one next to the title), done by the local AI and kept for next time.

Texts live in the code in English and are looked up in `web/src/i18n/fr/` and `server/src/i18n/fr/`; `npm test` fails when a text has no French. Change notes in French are in `CHANGELOG.fr.md`.

## Profiles

Settings, Profiles: each profile has its own kinks, history, sources and settings (the AI models are shared). Add one and it opens with the welcome steps; switch, rename, back up, restore a backup as a new profile, or delete. Backups are in `~/Library/Application Support/Undercurrent/backups`.

## Test mode

Hold **Option** while opening Undercurrent (click it in the Dock, Launchpad or Applications and keep Option down until the window shows). It opens in test mode: fake posts with placeholder pictures and two short sample clips, a fake model, nothing explicit. It is the same mock mode used for development and testing (`npm run dev:mock`).

- It has its own data folder (`~/Library/Application Support/Undercurrent/Test mode`) and its own port (4318), so your real database, feed, taste and Ollama are never touched, and it can run next to the normal app.
- It opens straight on the feed, in the app's language. The welcome steps can still be run from Settings.
- The Dock icon says "Test" and a yellow line at the top of the page says it is test mode.
- The Undercurrent menu has **Restart Normally** and **Reset Test Data**; the normal app has **Restart in Test Mode**. `open -a Undercurrent --args --test` works too.

## Your data

- Your database, settings, history and logs live in `~/Library/Application Support/Undercurrent`, never in this folder, so they are never committed or pushed and updates never touch them.
- The only outgoing traffic is fetching posts and media from the sources you turned on, and downloading Ollama and the models. Hover over the status in the top right to see every host contacted.
- Settings has an export of your whole profile and a button to wipe it.

## Updates

The app checks GitHub every few hours. When there is a newer version, an **Update to …** button appears in the top bar: it shows what changed, downloads the new app, swaps it in and opens it again. Your data is not inside the app, so it is never touched. Settings, Version and updates has a check button and the full change history.

### Making a new version

1. Add a section to `CHANGELOG.md`, for example `## 0.16.0 · 4 October 2026`, with the changes as `- ` lines under `### ` headings.
2. Run `npm run release -- 0.16.0`. It sets the version everywhere, commits, tags `v0.16.0` with the notes and pushes both.
3. GitHub then builds the app on its own Macs (`.github/workflows/release.yml`, about ten minutes) and publishes it as a Release with `Undercurrent.dmg` and `Undercurrent-mac.zip`. Every installed Undercurrent offers the update as soon as the files are there.

Version numbers are `0.MINOR.PATCH`: a bigger feature raises MINOR, fixes raise PATCH.

## Working on the code

You need Node.js 22 or newer and Xcode or the Command Line Tools (`xcode-select --install`).

```bash
git clone https://github.com/mabuxi/undercurrent.git
cd undercurrent
npm install
npm run app          # builds Undercurrent.app from this folder and puts it in Applications
npm run package      # builds the downloadable app: mac/dist/Undercurrent.dmg and Undercurrent-mac.zip
```

An app built with `npm run app` runs the code in this folder and updates it with git (it needs to be able to fetch the repository). The downloadable app updates from the Releases.

### Without the app

```bash
npm run dev:mock     # test mode at http://127.0.0.1:5173: fake posts and a fake model, no accounts
npm start            # the real thing at http://127.0.0.1:4317
```

Or double-click **Undercurrent.command**. To open it from another device on your home network, use `http://<this Mac's IP>:4317`; set `HOST=127.0.0.1` in `.env` to keep it to this Mac only.

## Models

The welcome steps pick the models for you:

| Job | Model | Size |
|---|---|---|
| Tagging every post, quick look at pictures | `huihui_ai/qwen3.5-abliterated:4b` | 3.4 GB |
| A closer look at the posts you love | `huihui_ai/qwen3.5-abliterated:9b` | 6.6 GB |
| The assistant (32 GB of memory or more) | `orcarouter/Qwen3.8-27B-Uncensored:q4_K_M` | 17 GB |

With less than 32 GB of memory the assistant uses the 9B model too. Every installed Ollama model shows up in Settings.

## Sources

Settings, Sources lists every source with a switch, a test button and what you follow there.

| Source | Needs | What you get |
|---|---|---|
| Pornhub, Eporner, RedTube | nothing | Long-form videos with tags and performers |
| RedGIFs | nothing | Short clips and GIFs, creators, niches |
| Reddit | nothing (a feed key makes it faster) | Subreddits and users through public RSS feeds |
| Bluesky, Lemmy | nothing | Creators and communities |
| Rule34, Gelbooru | a free key | Drawn content with detailed tags |
| XVideos, XNXX, xHamster, YouPorn, TXXX | a scraper server | Search results through your own Lustpress server, hosted somewhere else |

## How it learns

What you do turns into scores per tag, creator, community and format on three time scales: right now (fades within an hour), lately (about a week) and all time. Heat, saves and likes count most; watching counts a little; scrolling past counts against.

**Kinks** are specific things you keep coming back to: at least four posts you clearly liked, on more than one day, and clearly more common in what you love than in everything you see. Tags that are on almost every post never become kinks. Kinks get plain names, are grouped by family once two share one (Body, Clothing, Places…), update by themselves and fade when you stop. Anything you change by hand stays. Manage them on **Your map**.

**What you did not like**: after a thumbs down, a hide or a block, the post asks what you did not like, offering its tags minus the ones you like. Only what you pick counts against similar posts. For hides and blocks the bigger local model also has a look (several posts together for a block) and marks its guess; a guess never counts on its own. If you leave the question, the guesses wait in Memory, Did not like, To verify, until you confirm or drop them. What you confirmed is listed there too, and can be taken back.

**Filters** (formats, new or popular, how much new to you, the mood) stay set until you change them, also after closing the app, and apply to searches too.

## Safety

A built-in filter removes anything that suggests a person under 18 before it is stored or shown, and searches for minors are refused. Posts from sites that do not verify ages get an image check by the local model. This cannot be turned off. Your own hard limits work on top of it.

## Project layout

```
mac/                 the Mac app (Swift, a window around the local web app), build.sh and package.sh
.github/workflows/   builds and publishes the downloadable app for every version
install.sh           the one-line installer
server/src/          the local server: sources, tagging, ranking, kinks, setup, updates
web/src/             the interface (React)
scripts/             release.sh, browser tests
CHANGELOG.md         every version and what changed
```

## Tests

```bash
npm test
```
