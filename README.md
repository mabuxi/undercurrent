# Undercurrent

A private Mac app that turns many adult sources into one feed tuned to exactly what you're into. Local AI models tag every post and look at the pictures, your taste is learned from what you heat, like and save, and your kinks build themselves on a map you can edit. Everything about you stays on your Mac.

Current version: see [CHANGELOG.md](CHANGELOG.md).

## Install on a Mac

You need macOS 13 or newer, [Node.js](https://nodejs.org) 22 or newer and Xcode or the Xcode Command Line Tools (`xcode-select --install`). Ollama and the models are installed from inside the app.

```bash
git clone git@github.com:mabuxi/undercurrent.git
cd undercurrent
npm install
npm run app
```

`npm run app` builds **Undercurrent.app** and puts it in Applications. Open it like any other app. The first time, the welcome steps walk you through the local AI (Ollama and the models download with progress), who you want to see, your kinks, fantasies, sources and hard limits.

Quitting the app (⌘Q, or closing its window) stops the server, unloads the models and quits Ollama.

## Your data

- Your database, settings, history and logs live in `~/Library/Application Support/Undercurrent`, never in this folder, so they are never committed or pushed and updates never touch them.
- The only outgoing traffic is fetching posts and media from the sources you turned on, and downloading Ollama and the models. Hover over the status in the top right to see every host contacted.
- Settings has an export of your whole profile and a button to wipe it.

## Updates

Every version is a git tag (`v0.14.0`, `v0.15.0`, …) with its notes in [CHANGELOG.md](CHANGELOG.md). The app checks GitHub every few hours. When there is a newer version, an **Update to …** button appears in the top bar: it shows what changed, installs it, rebuilds the app and restarts. Settings, Version and updates has a check button and the full change history.

Updating needs this Mac to be able to read the repository (the SSH key of this Mac added to the GitHub account that owns the repository).

### Making a new version

1. Add a section to `CHANGELOG.md`, for example `## 0.15.0 · 12 October 2026`, with the changes as `- ` lines under `### ` headings.
2. Run `npm run release -- 0.15.0`. It sets the version everywhere, commits, tags `v0.15.0` with the notes and pushes both.

Version numbers are `0.MINOR.PATCH`: a bigger feature raises MINOR, fixes raise PATCH.

## Without the app

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

## Safety

A built-in filter removes anything that suggests a person under 18 before it is stored or shown, and searches for minors are refused. Posts from sites that do not verify ages get an image check by the local model. This cannot be turned off. Your own hard limits work on top of it.

## Project layout

```
mac/                 the Mac app (Swift, a window around the local web app) and build.sh
server/src/          the local server: sources, tagging, ranking, kinks, setup, updates
web/src/             the interface (React)
scripts/             release.sh, browser tests
CHANGELOG.md         every version and what changed
```

## Tests

```bash
npm test
```
