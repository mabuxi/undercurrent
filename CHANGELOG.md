# Changelog

Every version of Undercurrent, newest first. The app reads this file to show what changed when you update.
Versions are `0.MINOR.PATCH`: a bigger feature raises MINOR, fixes raise PATCH. Each version is a git tag (`v0.14.0`).

## 0.17.1 · 5 October 2026

### Fixes
- Translations use the middle local model (the 9B one when it is installed) and are told which language the post is in: the small model often gave titles back untranslated.
- Titles in capitals are translated as normal sentences.
- A text that comes back untranslated is never kept, and you are told to try again.

## 0.17.0 · 5 October 2026

### French
- Undercurrent speaks French. Switch between English and French in Settings, Language, or on the first welcome step; the first start follows your Mac's language.
- Every screen, message, search step, error, update note and the Mac app's own menus follow the language.
- Kink and family names are shown in French. Tags stay in English everywhere.
- The assistant answers in the language you chose.
- Searching in French also searches the English words the sources use, and the French word too: "pieds poilus" finds feet and hairy, plus posts titled in French.

### Translate
- Posts written in another language than yours get a Translate button under their text and a small one next to the title. The local AI on this Mac translates them, and translations are kept, so the second time is instant.
- The buttons only show when the language of the post is clearly known and differs from yours.

### The language does not change what you get
- French titles and texts give the same English tags as English ones, so French posts land in the same kinks.
- The taggers always tag in English, also for French posts.
- Ranking, kinks and learning are the same in both languages.

### Other
- Dates and numbers use European formats in both languages.
- Counts read correctly in the singular ("1 reply", "1 flame").

## 0.16.1 · 4 October 2026

### Fixes
- The Terminal installer now closes a running Undercurrent properly before it puts the new version in place.

## 0.16.0 · 4 October 2026

### Download it like any other app
- Undercurrent now comes ready-made on the GitHub Releases page: a disk image to drag into Applications, or one line to paste in Terminal that installs and opens it.
- Nothing to install first: no Node.js, npm, Xcode or git. The app carries its own Node.js.
- It runs on Apple Silicon and Intel Macs with macOS 13 or newer.
- The first start still installs Ollama and downloads the models that fit your Mac by itself.

### Updates
- The downloaded app updates itself from GitHub Releases: it downloads the new version with a progress bar, swaps itself and opens again on the new version. No git or GitHub account needed.
- Every new version is built and published by GitHub automatically as soon as it is tagged.
- An app built from a code folder keeps updating with git, as before.

### Other
- The downloaded app reads optional server settings from a .env file in its data folder.

## 0.15.0 · 4 October 2026

### Profiles
- Settings has profiles now: each one with its own kinks, history, sources and settings. The local AI is shared.
- Add a profile and it opens with the welcome steps; switch between profiles with one click (Undercurrent restarts on the other one).
- Rename profiles, give them a colour, back them up, restore a backup as a new profile, and delete profiles you don't need.

### Choosing the AI models
- For each job (tagging, the closer look, the assistant) Undercurrent recommends the model that fits this Mac, from its chip and memory, and shows what every other option needs.
- Pick another one, or type any model Ollama knows. The same choice is in Settings, Local AI models.

### Everything downloads by itself
- The first time, Ollama is installed automatically when it is missing.
- The models download as soon as you have chosen them, while you go through the rest of the welcome steps.
- Downloads that were cut off continue by themselves the next time Undercurrent starts.

### Who you see
- The slider starts at 50%. From 45% to 65% it means hetero only: a man and a woman together.
- New "Everyone" option: posts with anyone, whatever the slider says.
- The slider in the welcome steps is centred, with the hetero range marked on it.

### Fixes
- Checking for updates uses this Mac's own key for the repository.

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
