# Changelog

Every version of Undercurrent, newest first. The app reads this file to show what changed when you update.
Versions are `0.MINOR.PATCH`: a bigger feature raises MINOR, fixes raise PATCH. Each version is a git tag (`v0.14.0`).

## 0.21.1 · 8 October 2026

### Welcome steps
- Suggestions come from the local AI now: every pick asks it for more in that family and in others that go with it, with the ready-made kinks as examples it must not repeat. What it sends back is checked: a real kink in a family that exists, nothing already on screen, nothing vague, nothing about age, family members, animals or non-consent. The family you clicked in shows when it is thinking. Without the AI (still downloading, or skipped), the ready-made suggestions are used.
- "Generate more" asks the AI for more of that family the same way; without it, the rest of that family's ready-made kinks.
- Kinks from the AI have the dashed outline again, also after being added, until you pick them. What you pick always stays in view in its family.
- Countries under a continent no longer have the corner mark.
- Fantasy ideas are one short, explicit sentence again, like a scene description instead of a story: a specific setting, someone, the act and a thrill from your picks. The kinks each idea uses show under it, here and in Memory. The local AI is told the same.

### Videos
- Players from other sites no longer have any like on click or double-click: every click there is for the player.

### Under the hood
- The release build uses the Node 24 versions of its GitHub actions, so GitHub no longer warns about Node 20.

## 0.21.0 · 8 October 2026

### Search bar
- What the feed is showing (filters and search tags) sits inside the search bar, before what you type, on as many lines as it needs. The × clears all of it. On a phone they stay under the bar.
- The "Clear all" chip is gone: the × does the same.
- What a search did is one summary line: what was searched for and where ("Searched for “hairy chest” on Pornhub and RedGIFs"), with how much was found. Point at the bar, or type in it, and every step folds out.

### Feed
- Someone you follow who posts a lot no longer floods the feed: per session you get their most popular post you have not seen, or two when you like their posts.
- Popular posts have to fit you at least as well as most of your feed; attention only decides between those.
- A source's own name (Pornhub, RedTube and so on, used when a post has no uploader) is never treated as a creator or community: not in the Right now picks, not in what you like.
- Posts marked [OC], (OC), [OG], (OG), "OC:" or "OG:", or with an OC tag, get the Original content badge at the top right, and the marker is taken out of the title and tags. Posts already here get it too.

### Posts
- Point at a tag on a post and an × appears: take off a tag that does not fit. It stays off that post, stops counting for your taste from it, and the tagger is told so it uses that tag more carefully.
- Players from other sites: a like needs two quick clicks; a player taking focus by itself no longer counts as one.
- Profiles of creators and performers have "Search {name}" with a magnifier, instead of "Only this creator in the feed". "Add … as a source" is gone: following someone already does that.

### Welcome steps
- The first step shows the Undercurrent icon.
- The local AI step waits until the models are downloaded, running and answer a test question before the kinks. "Continue without the AI for now" stays there for a long first download.
- Kinks follow who you want to see: for hetero, women's, men's and couples' types side by side (MILF, couple, hotwife, girl next door, cougar...); for men only no women's or couples' ones; for women only no men's ones.
- Ethnicities start with continents, European / White included; pick one and its countries and regions show up under it. A continent's kink matches all of them.
- Suggestions only bring up kinks that are not on screen yet, a few per click, also in other families. Each family keeps at least six you have not picked in view, so picking brings the next ones up.
- Every family ends with "Generate more": more of that family from who you want to see and what you picked, from the local model when it runs.
- Fantasy ideas are mini stories now: a setting that is hard to come by, someone, what happens, and a twist that only comes from your picks (public means someone could see, a straight guy crosses a line). Each idea is its own story, using a few of your picks, not all of them. The same goes for fantasy ideas in the app. While they are being written, a pen and cards fill in.

## 0.20.2 · 8 October 2026

### Feed
- Mix windows ("Abs and Shower", "Abs × Shower") only show posts that have both, never just one of them. A post also counts when its title or text says it, before the closer look has tagged it. A mix only shows up when there are enough posts with both.
- The hetero zone on the women and men sliders is centred: 45% to 55%, so from 55% women to 55% men. It is marked on the feed slider too.
- "Everyone, any mix" is gone, from the feed filters and the welcome steps. If you had it on, your balance applies again.
- After hiding or blocking a post, the page scrolls back to the question about what you did not like, instead of jumping to the next post.

### Search
- What a search is doing shows only its latest line. Point at it (or tap it) and the earlier steps fold out above it.

### Welcome steps
- The Cock family is replaced by Positions: missionary, doggystyle, riding, reverse cowgirl, standing, 69, spooning, prone bone and mating press. The cock kinks moved to Body.
- Suggestions show up inside their own family, first, with a dashed outline, instead of in a separate row.
- Every family has an icon instead of a dot, and every step has a big icon above its title.
- Subtle motion throughout: the parts of each step come in one after another, picks pop, the icon breathes. Nothing moves when the Mac asks for reduced motion.
- Fantasy ideas are real scenes now (a place, someone, what happens), like "In a steamy shower, a muscular stranger goes down on you", never the picks in a row. The local model is told the same.

### Memory
- What you did not like now lives inside Turn-offs and limits, which always shows and spans the full width.
- Long cards scroll inside themselves instead of growing the page.

### Settings
- The What's new and update window always covers everything, also when opened from Settings. Esc or a click outside closes it.
- A source's searches, creators and communities: the name has the room it needs, with its labels and when it was fetched under it. Names no longer break letter by letter.

## 0.20.1 · 8 October 2026

### What you did not like
- After a thumbs down, a hide or a block, the post asks what you did not like, with its tags as choices (leaving out what you like). Only what you pick counts against similar posts.
- A thumbs down only asks. For a hide or a block the bigger model also has a look and its guess is marked in the choices, but a guess never counts on its own.
- "Not sure", or leaving the question: the guesses wait in Memory, Did not like, under To verify, until you confirm or drop them.
- Fixed: reasons picked after a thumbs down did not show under Did not like.

### Search and filters
- A search or a filter shows "Showing: …" and how many posts match in place of the "Tonight leans into…" line. The generic "posts from your sources" sentence is gone; only sources that did not answer and search notes are still written out.
- New "Clear all" chip next to the search chips: clears the search and every filter shown there at once.
- The Right now picks refresh with the side windows, also when you scroll back to the top, and rotate through more of what fits you each time.

### Videos
- Double-clicking a player from another site counts as a like only when both clicks are quick (within 0.3 s).
- A double-tap on a video no longer pauses it: a single tap waits a moment before playing or pausing.

### Look
- Moods are small tiles in one full row (two full rows of three on a phone), never with an empty gap at the end. The hint shows when you point at one.
- The Filters button and the sub-tag chips in windows are less round, and those chips stay on one line instead of turning into tall ovals.

### Tags
- More tags per post when they are sure: every meaningful word of the title, site tags and hashtags, and what the title plainly means ("stepmom catches me" is stepmom and caught).
- Hashtags become tags, split into words (#BigBalls is big balls, #hairy_chest is hairy chest), leaving out noise like #fyp. Posts already here get them too.

## 0.20.0 · 7 October 2026

### Filters
- The feed controls are behind one Filters button, on the Mac too, with a count of what is set. The Right now picks stay visible next to it.
- Every filter stays set until you change it, also after closing Undercurrent: formats, new or popular and the period, how much new to you, the mood, and whether the panel is open.
- Filters apply to searches too: the gender balance, the formats and new or popular. Only a search that says who it wants, or looks up one person, ignores the gender balance.
- At the end of a search with filters set, "Remove filters to find more results" shows the same search without them, for that search only.

### Search
- The assistant's answer takes the place of the line under the greeting ("Tonight leans into…"), in the same size, and the page scrolls to it.
- Searching no longer adds "going deeper" posts after one you liked: a search shows what you searched for.
- "Gay for pay" (also "gay for fans") is a kink of its own, in English and French searches too.

### Videos
- Double-click a player from another site to like the post, like a double-tap on a picture.
- New full screen button on videos: the whole video always fits the screen, never cropped. Pinch to zoom on the iPhone and the Mac trackpad, or ctrl and the scroll wheel, double-tap to zoom in or out, drag to move around. On a Mac it uses the real full screen.

### Creators
- A creator's or performer's panel shows their top posts as pictures: what is here plus what is fetched from the source right then, most upvoted and viewed first.
- "Find everything from…" is now "Look up…".
- Block a creator or performer: stronger than hiding a post. Everything from them is hidden, also what comes later, and the bigger model looks at several of their posts together to learn what you did not like. Blocked creators can be unblocked in Memory.
- Every small button in the app has an icon now.

### Memory
- New "Did not like" section: what the bigger model found after hides, thumbs down and blocks, leaving out what you like. Only tags that still count against posts show, with how often; tap × if it was not that, and it is taken back.
- New memory suggestions come by themselves every couple of sessions, and unanswered ones make room after a week.
- Every ten windows or so a memory to review comes in between, at most two per session.
- Older memories, ones that may have been a phase and ones whose tags have cooled down are asked about again: "Still true?". Pinned memories and your limits never are.
- Fantasy ideas: at most four, a new set every two sessions.
- Everything you did: liking a post several times counts once and shows once; heat shows how hot it is now.

### Feed and windows
- The saves window comes far less often: never in the first twenty windows, at most once in sixty and once every two hours.
- Bigger thumbnails in list windows.

### Welcome steps
- The kinks to pick from are broader: straight first, with gay and lesbian mixed in.
- Every pick adds its own related kinks to "Goes well with that", and they stay, so the list keeps growing as you click.

### Fixes
- On a phone the filters you keep set no longer stretch the top bar; they are in the Filters button and the Showing line.
- Switching views opens the new view at its top.
- The end of a search no longer leaves a screen of empty space, and its buttons are easier to read.
- Text posts in a creator's pictures show their title instead of an empty tile.

## 0.19.2 · 6 October 2026

### Test mode
- Hold Option while opening Undercurrent to open it in test mode: fake posts with placeholder pictures and sample clips and a fake model, nothing explicit. It is the same mode used to develop and test Undercurrent.
- Test mode has its own data folder and its own port: your real data, feed, taste and the local AI are never touched, and it can run next to the normal app.
- It opens straight on the feed, in your language. The Dock icon shows "Test", the window title and the start screen say it, and the page shows a yellow test mode line.
- The Undercurrent menu has "Restart in Test Mode", and in test mode "Restart Normally" and "Reset Test Data".
- The downloaded app now carries the two short sample clips test mode plays.

## 0.19.1 · 6 October 2026

### Back to the original look
- Like and dislike keep their original colour again, with no gradient: when on they are a little brighter, on a soft flat background of the same colour.
- The reactions in the middle of a post use the same line icons as the buttons below it, only bigger and bolder, on a small frosted glass disc like the tab bar. The arrow draws itself in, bounces and rises (or sinks for a dislike); the bookmark fills in; the eye is crossed out; taking something back fades a smaller outline.
- The heat flame in the middle is the slider's own flame, in the same colours, on the same disc: it grows and glows with the heat, flares up when you let go and goes out at zero.
- Reactions show in the middle of the part of the post you can see.
- Memory keeps its new layout, but in the app's usual flat cards: no colour washes, the colours only on the small icons.

### iPhone
- Double-tap a picture or video to like it, like on Instagram. A single tap on an image still opens it, a moment later.
- A post taller than the screen can be scrolled through freely: while it is at the top, the feed only snaps near its end or near the next post.
- The "more tags" button is now a clean "+N" chip in the same style as "+ kink", after the line of tags, which fades out softly instead of hiding chips under a button.

### Fixes
- Image collections with a big picture and small ones no longer spill over the tags below them on a phone.

## 0.19.0 · 5 October 2026

### Reacting to a post
- Liking a post plays a big, bouncy arrow rising in the middle of it, like a like on Instagram. Disliking plays the same arrow upside down, sinking.
- Saving drops a golden bookmark into the post; unsaving and taking a like or dislike back play a small fading outline.
- Sliding the heat bar puts a flame in the middle of the post that grows, warms up and flickers faster the hotter you set it. Letting go makes it flare up with embers; setting it back to zero puffs it out in smoke.
- Hiding a post shows a crossed-out eye, the post dims and sinks away.
- Like and dislike now get a coloured background when they are on: green for a like, red for a dislike.

### Motion everywhere
- Posts, cards, views, panels, toasts and windows come in with soft, short animations; buttons give a little when pressed; the search bar glows when you type.
- On a phone the tab bar's light pill slides from tab to tab.
- Everything respects the "Reduce motion" setting of the Mac or iPhone: with it on, the animations are left out.

### Memory
- "Everything you did" moved from Your map to Memory, unchanged.
- Memory is organised: counters at the top (memories, to review, pinned, fantasies), a bar to jump to each section, and a "To review" section that gathers every suggestion in one place.
- Each category has its own colour and icon, empty categories fold into one line with a quick add button, and the category is picked with coloured chips when you add a memory.
- Fantasies are shown as cards.

### Feed
- The feed leans more to what is popular right now: every post is compared with the other posts of its own source, both on how well it was received and on how fast it is rising. Posts taking off now and fitting you come about every fifth post.
- Posts that hardly anyone liked come less often, unless they fit your taste well. Discovery picks favour new things other people liked. Your taste still comes first.
- Showing only some sources ("only bluesky") keeps the same ranking as the normal feed, and fetches more from those sources in the background: what is popular there and searches for your strongest tags.

### iPhone
- The less used buttons of a post (ask, why this, save, less like this, open) are in a ⋯ menu on the same line as the others.
- Kinks and tags take one line; the arrow at its end opens them all.

## 0.18.1 · 5 October 2026

### iPhone
- The Undercurrent name stays at the top on a phone, small, on the same line as the search. The search button becomes an arrow to make room.
- Pictures and videos are as big as they can be while staying fully on the screen. The rest of the post (tags, buttons) may run below the screen: scroll a little to see it, and scrolling past the end of the post snaps to the next one.

## 0.18.0 · 5 October 2026

### On your iPhone
- A phone button at the top shows a QR code: scan it with the iPhone camera to open Undercurrent from the Mac on your phone (same Wi-Fi). It uses the Mac's feed, taste and local AI.
- The code is a key: only devices that scanned it get in, nobody else on the same Wi-Fi. "Forget all paired phones" makes a new code.
- Add it to the Home Screen and it opens full screen like an app, with its own icon (web app support for iOS).
- On a phone the views are a floating, frosted tab bar at the bottom, like iOS: Feed, Saved, Your map, Memory, Settings.
- The feed snaps from post to post, one at a time. Every post fits on the screen, with the picture or video as big as it can be. Long stories start shorter and open with "Continue reading".
- A window comes between every 3 to 5 posts.
- The top bar is one slim line, and the feed controls fold away behind "Tune the feed".

### Search
- Name sources in the search bar to see only them for a while: "only bluesky", "bluesky, reddit", "hairy feet on reddit". They show as a chip you can remove.
- Searching, clicking a tag or changing a filter scrolls straight to where the feed starts, with a line saying what is shown and how many posts match.
- Filters and search tags are in one row with one look, so a clicked tag no longer jumps around next to the search tags.

### Learning
- Taking a like, a save or heat back undoes exactly what it taught your feed. Heat taken back below two flames also takes back the upvote it gave.
- Hiding or disliking a post: tags you already like are left alone, and the bigger local model looks at the post (frames from the video when it can) to find what you probably did not like. What it finds shows under the post, and you can take back any reason with ×.

### Mac app
- The window moves by dragging the top bar, and a double-click zooms it, like a normal title bar.
- The window buttons no longer cover the Undercurrent name; the "Local browser" line under it is gone.
- The local AI status is a small dot left of the search bar: click or hover it for the details.
- Ollama starts hidden in the background and stays out of the way.

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
