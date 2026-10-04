# Changelog

Every version of Undercurrent, newest first. The app reads this file to show what changed when you update.
Versions are `0.MINOR.PATCH`: a bigger feature raises MINOR, fixes raise PATCH. Each version is a git tag (`v0.14.0`).

## 0.14.0 · 4 October 2026

### A real Mac app
- Undercurrent is now an app you open from Applications or the Dock, with its own icon and menus.
- It starts everything it needs by itself: the server, Ollama and the local models.
- Quitting the app (or closing its window) stops the server, unloads the models and quits Ollama.
- Your data moved to ~/Library/Application Support/Undercurrent, apart from the code. Updates and re-downloads never touch it. The first start copies your existing data there; the old copy stays as a backup.
- Links to other sites open in your normal browser; videos keep playing inside the app.

### Welcome steps
- A first-run welcome in eight steps: what Undercurrent is, the local AI, who you want to see, your kinks, fantasies, sources and hard limits.
- The local AI step installs Ollama if it is missing and downloads the models with live progress. On Macs with less than 32 GB of memory, the assistant uses the 9B model.
- The kink picker shows every family in its own colour, with live "goes well with that" suggestions as you pick.
- Fantasies are written by the local model from your picks (simple pairings when the model is not ready yet), and you can add your own.
- Sources are listed most popular first.
- You can run the welcome again from Settings.

### Updates through GitHub
- Undercurrent checks GitHub for a newer version every few hours and shows an "Update to …" button when there is one.
- Updating shows the change notes, installs the new version, rebuilds the app and restarts by itself.
- After an update, "What's new" shows once. Settings has the version, a check button and the full change history.

### Other
- No more personal names in the code or tests.

## 0.13.0 · 4 October 2026

### Kinks rebuilt
- A kink is now one specific thing you keep coming back to, proven by heat, likes and saves on several days, and clearly more common in what you love than in everything you see. Tags on almost every post (big cock, gay, cumshot) never become kinks.
- Plain names from the tags themselves; every spelling is folded into one kink; duplicates are combined.
- Families (Body, Ethnicity, Clothing…) appear once two kinks share one; kinks in a family share its colour.
- Kinks update by themselves; anything you change by hand stays.
- Kinks moved from Memory to Your map: a full board, the same detail view as clicking the map, combine, colour, regroup, remove, bring back.
- Recent interactions show a thumbnail and open the post.

### Tagging
- The quick look at pictures stopped copying its own example tags (it put "shower" on a third of everything); thousands of those made-up tags were removed.
- Taggers only tag what a post says or shows.
- Posts can be put in or taken out of a kink by hand.

### Small things
- A heat of two flames or more also upvotes the post.
- "In this video" names have no @; a search button when someone is not found; opened panels scroll into view; saved windows much rarer.

## 0.12.0 · 29 September 2026

- Scraper server support (Lustpress) for XVideos, XNXX, xHamster, YouPorn and TXXX, merged with the official APIs of Pornhub, RedTube and Eporner.
- Profiles from every source in search, sorted by reach.
- Window fixes: no full-size previews under 90%, carousels show the next post, preview frames cycle in windows, no image twice.
- "Right now" picks with kinds, a "Showing" row under the search bar, a Saved tab, calmer loading while scrolling.
- Counters only when the source has them; a more accurate "Why this".

## 0.11.0 · 29 September 2026

- Person search across sources with typo correction, a profiles section, "In this video".
- One-command start that also starts and stops the local models; local network access limited to private networks.

## 0.10.0

- Live multi-source search with steps, chips and an assistant that can take several actions.

## 0.1.0 to 0.9.0

- The local feed: sources, tagging with local models, the taste profile, windows, the map, journeys, memory and fantasies.
