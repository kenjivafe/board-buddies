# Board Buddies

Party games for one phone and a full table. Built with Next.js 14 (App Router) + TypeScript, zero runtime dependencies beyond React.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Deploys to Vercel as-is (`vercel` or connect the repo — no config needed).

## Two ways to play

Every game opens on the same fork:

- **One phone** — pass it around. Coup hides hands behind a gate you hold to peek through. Works with no backend at all.
- **Our own devices** — the host opens a room, everyone else scans a QR or types a 4-letter code, and each player follows on their own screen.

Rooms are optional. With no Redis configured the app runs exactly as before and the room option is shown disabled — nothing else changes.

### Turning rooms on

Create a free Redis database at [Upstash](https://console.upstash.com), then copy its REST credentials into `.env.local` (or Vercel's environment variables). See [.env.example](.env.example).

```
UPSTASH_REDIS_REST_URL=…
UPSTASH_REDIS_REST_TOKEN=…
```

### How it works

The reducers were already pure functions over actions, so they run **server-authoritative** unchanged. A device sends an action; the server applies it and hands back a redacted view. The client is never trusted to police whose turn it is — [engine.ts](lib/room/engine.ts) refuses anything a player isn't entitled to, per game and per action.

**Redaction is the load-bearing part.** In one-phone Coup the device legitimately holds every card, and the pass gate is what keeps hands private. That's useless once state crosses the network, so [view.ts](lib/coup/view.ts) builds each player a view containing their own two cards, everyone's spent cards, and a *count* of the court — never its contents, and never the undo stack, which holds full snapshots of every hidden card in the game. King's Cup has nothing to hide, so its view drops only the undo stack.

**Reactions changed shape.** On one phone a single "let it stand" speaks for the whole table. On separate devices that would let one player decide for everyone, so `Pending.passed` tracks each responder and the action resolves once they've all passed — and a challenge is now just your own button, not a "who challenged?" picker.

**Sync is SSE, not pub/sub.** Upstash speaks Redis over REST, and `SUBSCRIBE` is a blocking command REST can't carry, so there's no pub/sub to hang off. Instead [stream/route.ts](app/api/rooms/[code]/stream/route.ts) polls the room's version key — one cheap `GET` — and pushes the full room only when it changes. `EventSource` reconnects on its own, which is what keeps each stream inside Vercel's function duration cap.

Writes use compare-and-set against that version key via a small Lua script, so two people tapping at once can't clobber each other; the loser retries.

**Watch the command budget.** Upstash's free tier allows 10,000 commands a day and each watching device costs one per interval. Four players for twenty minutes at the default 1500ms is roughly 3,200 commands. `ROOM_POLL_MS` tunes the trade between snappiness and quota.

`MAX_SEATS` in [store.ts](lib/room/store.ts) caps every room at 8 for the same reason, whatever a game's own maximum says — King's Cup and One Night Werewolf both seat more than that on one phone.

**Seats have to be reclaimable.** "Leave room" only works for somebody still looking at the page; close the tab and the seat stays, and the game then deals it a hand and waits on it all night. So the host gets an ✕ beside every other seat in the lobby (`op: "drop"`), lobby-only for the same reason leaving is — removing a player mid-game would strand the state. Leaving no longer navigates away until the seat has actually been released, either.

## Layout

The hub at `/` lists every game; each game owns a route and a matching folder in each top-level directory.

```
app/
  page.tsx              hub — renders from lib/games.ts
  globals.css           shared tokens, shell, type, buttons, hub
  <game>/
    page.tsx            route entry
    layout.tsx          metadata, stylesheet, [data-game] theme wrapper
    <game>.css          this game's palette + styles
components/<game>/      game UI
lib/<game>/             game logic (no React)
lib/games.ts            the registry the hub renders
```

### Theming

Board Buddies is the container, not a look every game inherits. The brand skin is a cool dark room with one warm lamp — deliberately neutral, so each game can bring its own world. King's Cup is a midnight card table; the next game won't be.

`globals.css` defines a set of **semantic tokens**, and each game re-declares them scoped to its own route:

| Token | Role |
|-------|------|
| `--bg` | page ground |
| `--surface` / `--surface-2` | raised panels |
| `--text` / `--text-dim` / `--muted` | type ramp |
| `--line` | hairlines and borders |
| `--accent` / `--accent-ink` | primary fill and the type that sits on it |
| `--danger` / `--danger-ink` | destructive actions |
| `--display` / `--display-vf` | display face and its variation axes |
| `--sans` | body face |

A game route sets these inside `[data-game="<slug>"]` alongside its own private colors (see the top of [kings-cup.css](app/kings-cup/kings-cup.css)), and the shared shell, type and controls follow automatically — no shared class needs to know the game exists.

### Adding a game

1. Add an entry to `GAMES` in [lib/games.ts](lib/games.ts) — the hub picks it up automatically. Its `accent` tints that game's card, so the hub gets more colorful as the shelf fills.
2. Create `app/<slug>/` with `page.tsx`, `layout.tsx` (wrapping children in `<div data-game="<slug>">` and importing the stylesheet) and `<slug>.css`.
3. Open `<slug>.css` with a `[data-game="<slug>"]` block declaring the semantic tokens above.
4. Put UI in `components/<slug>/` and logic in `lib/<slug>/`.
5. Namespace the localStorage key (`<slug>-v1`) so saves don't collide.
6. Link back to the hub with `<Link className="back-link" href="/">`.

Shared styles worth reusing: `.shell`, `.title`, `.eyebrow`, `.hint`, `.btn` (+ `-primary` / `-ghost` / `-danger`), `.icon-btn`, `.text-input`, `.back-link`.

## Typography

| Face | Role |
|------|------|
| Bricolage Grotesque | the Board Buddies brand — wordmark and hub |
| Fraunces | King's Cup only |
| Archivo | Coup only, condensed heavy caps (`wdth.css` for the width axis) |
| Cinzel | One Night Werewolf only, inscriptional roman caps (`wght.css` for the weight axis) |
| Instrument Sans | body and UI, everywhere |

The brand is set in a grotesque and the games in their own display faces, so the hub reads as the label rather than as one of the games.

## Games

### King's Cup — `/kings-cup`

The drinking card game as a pass-around phone app.

| Card | Rule |
|------|------|
| A | Trump Card — skip one drink, once (tracked as spendable tokens) |
| 2 | You — pick who drinks |
| 3 | Me — you drink |
| 4 | Left drinks |
| 5 | Right drinks |
| 6 | Hell — last to touch the table |
| 7 | Heaven — last to raise a hand |
| 8 | Mate — they drink when you drink (chains supported) |
| 9 | Rhyme |
| 10 | Categories |
| J | Thumb Master (persists until next J) |
| Q | Question Master (persists until next Q) |
| K | King's Cup (4-king meter) **or** King's Rule (rule text, replaced by next K) — chosen at setup |

QoL:

- Seat order = table order; 4/5 resolve the actual neighbor's name
- Persistent status rail: masters, active rule / cup meter, trump holders, mate chains
- Undo (30-step snapshot stack), draw history sheet, reshuffle with confirmation
- localStorage autosave with a resume prompt after refresh
- Drink tally + end-of-deck leaderboard (counts explicitly assigned drinks)
- Reduced-motion respected, one-hand mobile layout

### Coup — `/coup`

Bluffing and deduction for 2–6. Unlike King's Cup, hands are secret, so the phone doubles as each player's hand: anything private sits behind a **pass gate** (nothing renders until the named player confirms they're holding the phone), and hands are shown **hold-to-peek** so a hand is never left face-up on a phone about to change hands. Actions, challenges and blocks are public — declared out loud at the table, then entered on screen.

Court of 15: three each of Duke, Assassin, Captain, Ambassador, Contessa.

| Action | Cost | Claim | Stopped by |
|--------|------|-------|-----------|
| Income | — | — | nothing |
| Foreign Aid | — | — | Duke (anyone) |
| Coup | 7 | — | nothing |
| Tax | — | Duke | nothing |
| Steal | — | Captain | Captain or Ambassador (target only) |
| Exchange | — | Ambassador | nothing |
| Assassinate | 3 | Assassin | Contessa (target only) |

Rules the app enforces so nobody has to:

- Challenges resolve themselves — the app knows the truth, so a proven card is shown, shuffled back and replaced, and the challenger pays
- A collapsed block lets the original action through; a standing one doesn't refund the assassin's 3 coins
- Coup is compulsory at 10 coins and becomes the only action on the menu
- Stealing takes what's there, so a broke target can't be put in debt
- Losing your last influence eliminates you, and the turn order skips you
- With one influence left there's no choice to make, so the card flips without a prompt
- Two coins each, except head-to-head where the opening player starts on one
- A rematch opens on whoever won the last one, rather than always on the first seat — and head-to-head the coin handicap follows the opener

Also: undo (30-step stack), localStorage autosave with a resume prompt, and a public board showing coins and spent influences.

#### Card art

The five illustrations live in [public/coup/](public/coup/), named for their character (`duke.png` … `contessa.png`) — `CardFace` builds its `src` from the character key, so a replacement only has to keep the filename. All five are 1054×1492 (ratio 0.7064), which `.coup-card` uses as its `aspect-ratio`.

The art already carries the name and ability text, so nothing is drawn over it but the occasional state chip, positioned at the top so it never covers the printed caption. Where cards render too small for their own text to be legible — the four-up exchange, the setup reference — the name is printed underneath instead.

The whole skin is derived from the deck rather than invented alongside it:

- **Ink** `#191719` is the cards' caption band, sampled; the five character tokens are the cards' signature hues
- **Cream stock** `#ecd8c0` is Coup's UI accent, so a primary button and the claim plate read as pieces of the deck
- **Halftone grain** overlays the page — a two-layer dot screen standing in for the riso print texture, repeated at lower contrast over the cream plates
- **Condensed heavy caps** everywhere a card would set a name, matching the printed character names
- **The chevron** — the hatched bar with an angled cut and a solid blade beneath it, printed under every character name on every card — is rebuilt in CSS (`.chevron`) and reused as the app's own rule

Sources are ~3.6 MB each; they're served through `next/image`, which cuts a card to ~50–70 KB of WebP at the size it actually renders. That needs `sharp` (a dependency here) and a running Node server — a static export would ship the full-size PNGs instead.

### One Night Werewolf — `/werewolf`

Not the multi-night game. One night, one argument, one vote, and it's over in ten minutes — nobody is ever eliminated, and **the card you were dealt may not be the card you're holding by morning.**

Everyone gets one card and **three more go face down in the middle**, dealt to nobody. Roles wake in the rulebook's order and do one thing each. Four of them move cards around, so what you *do* at night follows the card you were **dealt**, and what you *win* with follows the card you're **holding at the end**. Those two coming apart is the entire game.

| Wakes | Card | What it does |
|-------|------|--------------|
| 1 | Werewolf ×2 | See the rest of the pack. A lone wolf may look at one centre card |
| 2 | Minion | See the pack. They never see you |
| 3 | Mason ×2 | See each other. Seeing nobody means the other Mason is in the middle |
| 4 | Seer | One player's card, **or** two centre cards — never both |
| 5 | Robber | Swap with a player, then look at what you took |
| 6 | Witch | Look at a centre card; looking commits you to planting it on somebody |
| 7 | Troublemaker | Swap two *other* players, without looking at either |
| 8 | Drunk | **Must** swap with a centre card, blind. You no longer know what you are |
| 9 | Insomniac | Wakes last and checks her own card, to see what the night did |
| — | Hunter | If you die, whoever you pointed at dies too |
| — | Prince | Votes cast against you don't count |
| — | Tanner | On nobody's side. Wins only by dying |
| — | Villager ×3 | Nothing at all |

Then everybody points at once. The most votes dies; a tie kills everyone tied; **nobody dies unless somebody drew at least two votes**. Kill a werewolf and the village wins. Kill none while one is loose and the pack does. If every wolf card was in the middle, the village wins only by killing nobody — otherwise the Minion, if there is one, wins alone.

The box is finite and the app enforces it: the counts above are what exists, and a lineup must come to **exactly players + 3**. The Masons only go in as a pair. Because the host chooses the box and the host is a client, [engine.ts](lib/room/engine.ts) re-validates the whole thing server-side before dealing — a box of nothing but werewolves is otherwise one POST away.

Rules the app enforces so nobody has to:

- The wake order is walked automatically, and **a role whose only card went to the middle wakes nobody** — which is what makes the middle worth lying about
- Looking at a centre card as the Witch is a commitment, so the look and the placing are two separate decisions with the card revealed in between
- You act on the card you were dealt even after somebody has taken it — the Insomniac still wakes, and still checks the card she no longer owns
- The Prince's protection follows the *card*: rob the Prince and you become untouchable instead
- Nobody may point at themselves, and nobody may abstain

**Redaction here is a single channel.** Everything a player learns arrives as a `Note` in their own notebook, so [view.ts](lib/werewolf/view.ts) filters one field rather than making a field-by-field judgement about each role's knowledge. The current night step is redacted to the people it wakes: publishing the running order would announce which roles were dealt to players and which are in the middle, every time one got skipped.

`slots` — the record of where every card actually *is* — is the one thing no view ever carries while the game is running. **Not even the one-phone device**, which is otherwise trusted with the whole table: it needs everybody's notebooks, because it shows each of them behind a gate, but it never needs the map, so it isn't given one. That means the three cards in the middle are face down for everyone until the end. Every role that gets to look at one — the lone werewolf, the Seer, the Witch — chooses it blind and is told what it was afterwards, through their own notebook. `CentrePick` has no way to draw a face at all, so no future change to the view can quietly turn it into a board showing the table the answer.

#### The narrated night

On one phone the app **is** the moderator, and it reads from a script ([Narration.ts](components/werewolf/Narration.ts)) rather than handing the phone to named people. This is load-bearing, not flavour: a gate reading *"pass the phone to the werewolves — Ana and Bo"* prints the answer to the entire table.

So the night runs as narration, in the rulebook's own words. Everyone shuts their eyes; the app calls a **role** — "Werewolves, wake up and look for other werewolves" — and whoever that is picks the phone up themselves. Between one role and the next the screen goes back to the dark for `BEAT_SECONDS`, sends the last role to sleep, waits, and only then makes the next call, so the phone changes hands with every other pair of eyes already shut. Whatever a role just found out is held on its own screen until they dismiss it, because otherwise the next call swallows it on the way past.

The night owes two lines on its way out, so the closing beat runs *after* the phase has already turned to day: the last role is sent to bed and then everybody is woken. Without it the final role acted and the screen cut straight to daylight, which meant the Insomniac never saw the card she had just checked.

The only screens that name anybody are the opening deal (which leaks nothing — everyone is passed their own card in seat order) and the day, when it's all public anyway.

#### The voice

The script is read aloud. Unlike Coup — where six characters speak and the cast rule governs who is allowed to give away what — Werewolf has exactly **one speaker** reading a fixed script, so there are no variants: every line is the same words every game, which is what makes it sound like a moderator rather than a soundboard.

[voice.ts](lib/werewolf/voice.ts) builds its manifest *from* [narration.ts](lib/werewolf/narration.ts) — the same constants the screen prints — so the words spoken and the words shown cannot drift apart. `voice.test.ts` asserts that pairing line by line, that every night step has both a waking and a sleeping line, and that each one has a recording on disk that isn't a stub.

Two things make it sound like a person running a game rather than a menu reading itself:

- **The ellipsis is a speech direction.** Every call is `"Werewolves... wake up."` — the pause is the beat a moderator leaves between the name and the instruction, so the right person has time to work out it's them. The synthesiser reads it as a pause and the screen prints the same words, so the two stay in step; the test enforces that every call carries one.
- **The moderator is slowed to 0.85.** At full speed a two-word command lands before anyone has looked up.

The voice is **pinned, not designed**: set `voiceId` on a profile and the generator uses that voice as-is. It never designs over it and never deletes it — which matters, because a pinned voice is somebody's own rather than one this script made.

Files live under `public/audio/werewolf/moderator/`. A voice id doubles as its folder, which is how two games share one `public/audio` without colliding: Coup's narrator is `narrator`, this one is `werewolf/moderator`. Same generator as Coup:

```bash
npx tsx scripts/generate-voices.ts --dry                     # cost estimate
npx tsx scripts/generate-voices.ts                           # only what's missing
npx tsx scripts/generate-voices.ts --redo=werewolf/moderator # recast the narrator
```

A missing file is **silence by design** — the game is fully playable before anybody has run the script, and stays playable if a clip fails to load.

#### One voice per table

Rooms used to be silent, and that was wrong. The night only reached the one device it woke, with no sound and no buzz, so a table could sit on "the village sleeps" with no idea whose turn it was or whether the game was even alive.

**A room has one voice now, and it is the host's.** Every handset reading the script would talk over the others, and a phone that speaks only when *its own owner* is wanted announces that owner to everybody sitting near it. So [RoomNarrator.tsx](components/werewolf/RoomNarrator.tsx) runs on the host's device and nobody else's — exactly as if a person were running the game — while each player's own screen quietly holds whatever is private to them.

That forced the night to change shape, in **both** modes. **Every role in the box is called**, whether or not anybody was dealt it: skipping the ones that landed in the middle announced which roles are in the middle, which is most of what the table is trying to work out. A role nobody holds has nobody to answer for it, so once its line has been read and given its beat the pacing device sends a `TICK` — and the reducer moves on *only if that step really was empty*, which is how the pacer is never told which ones were. A role somebody does hold ends its own step by acting, and the next line doesn't start until it has.

`narrate` is therefore published where `step` still isn't: the running order no longer depends on what's in the centre, so naming the line being said gives nothing away, while the screen stays dark for anyone the step doesn't wake.

#### The room tone

Under the voice there are three more layers, declared in [ambience.ts](lib/werewolf/ambience.ts):

- **The bed** — a 45-second loop of slow tribal drums over crickets. It comes up when the night actually falls (not during the deal, which happens with everyone awake), holds for `LEAD_IN_SECONDS` before the moderator says a word, ducks to a third of its level whenever she speaks, and is cut off by the cockerel at dawn rather than fading out under the argument. The first attempt was a forest atmosphere and it was wallpaper — a night that runs five minutes needs a pulse under it, not weather.
- **Howls**, dropped over the top at a random interval inside `HOWL_GAP`, in three takes so the same one never lands twice running.
- **A sting per role**, played the moment it is called and `STING_LEAD_MS` *before* the line starts. This is most of why the reference app feels like a game rather than a menu: whoever the growl or the bubbling cauldron belongs to knows it is them a beat before they are told. Each one is a thing that role does — stone on stone for the Masons, coins in a purse for the Robber, a ticking clock for the Insomniac.

```bash
npx tsx scripts/generate-sfx.ts --dry   # what it would cut
npx tsx scripts/generate-sfx.ts         # cut what's missing
```

Separate from the voice script on purpose, and it talks to **two** endpoints: the bed is composed music (`/v1/music`), because the sound-effects model makes atmospheres and not rhythms, and everything else is `/v1/sound-generation`. Both need permissions a text-to-speech key doesn't have, so the script catches the 401 and says which one is missing rather than dumping the raw error. As everywhere else in the audio layer, until the files exist the night is simply quiet. The narrator is one-phone only: a room has no shared speaker, every device would read over the others, and half of what they read would be calling roles that particular phone is not allowed to know about. So rooms never mount the provider and `useNarrator` hands them one that says nothing, which is why the night screens can call `say()` without caring which mode they're in. There's a mute toggle on every screen the narrator speaks from, and the choice sticks.

Rooms skip all of this. Nothing is passed and nothing is overheard, so a beat would only be dead time: your own device wakes you when you're wanted and says nothing when you aren't. [Night.tsx](components/werewolf/Night.tsx) keeps the two as separate functions rather than one screen with a flag, because they are genuinely different experiences.

#### Card art

The thirteen illustrations live in [public/werewolf/](public/werewolf/), named for their role (`werewolf.png` … `villager.png`) — `CardFace` builds its `src` from the role key, so a replacement only has to keep the filename. They're 1024×1536, and `--card-ratio` derives every frame in the game from that 2:3.

They're engraved tarot cards on aged parchment. Two things about them shape the UI:

- **The name is printed across the top**, as in Coup, so nothing is ever drawn over it: the one chip the app adds sits at the *foot* of the card, and where a card renders too small to read its own name, the name is printed underneath instead.
- **Each card carries its own painted frame**, so `.role-card` adds none. A second border around a card that already has one just reads as a mistake; all the CSS does is round the corners to match and lift the card off the page.

**There are three inks, not thirteen.** A colour per role was thirteen colours that meant nothing; the thing worth knowing at a glance is whose side a card is on, and there are only three answers — red for the pack, blue for the village, green for the Tanner, who is on nobody's side. `tint()` resolves a role straight to its team token, so a card frame, a lineup row and a reveal row cannot disagree about which side somebody was on.

Sources are ~3.5–4 MB each; like Coup's, they're served through `next/image`, which cuts one to a few tens of KB of WebP at the size it renders. That needs `sharp` (a dependency here) and a running Node server.

The skin is built from one light source rather than from the deck. At night the moon is the only thing giving anything away — a blue-white rim on every raised edge, deep shadow elsewhere; at dawn the same page warms to low sun, which is the only colour change in the game. The moon itself is CSS: a disc with a second disc bitten out of it, where `--phase` slides the bite from full to a fingernail.

## Logic tests

```bash
npx tsx smoke.test.ts    # King's Cup
npx tsx coup.test.ts     # Coup
npx tsx werewolf.test.ts # One Night Werewolf
npx tsx room.test.ts     # redaction + authorization for rooms
npx tsx voice.test.ts    # the voice-line matrix
```

[room.test.ts](room.test.ts) is the one to keep honest: it asserts that a Coup player's view names **exactly two** characters — their own — that a Werewolf player's names exactly one, and that neither the court, nor the map of where every Werewolf card actually is, nor anybody else's notebook, nor the undo stack ever reaches the wire. Then it walks every authorization rule for all three games.

Coup's suite covers each challenge and block branch, then fuzzes 400 random-but-legal games across 2–6 players, asserting at every step that all 15 cards are accounted for exactly once and that every game terminates with a single survivor.

Werewolf's does the same for card conservation, which is the invariant that matters once four different roles start swapping cards behind each other's backs: 400 fuzzed games across 3–10 players, asserting after every single action that the cards on the table are still exactly the cards in the box. It also walks every win condition — including the awkward ones, like a Tanner who dies alongside a werewolf, and a Minion left holding the bag when every wolf card turns out to be in the middle.
