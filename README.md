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

## Logic tests

```bash
npx tsx smoke.test.ts    # King's Cup
npx tsx coup.test.ts     # Coup
npx tsx room.test.ts     # redaction + authorization for rooms
```

[room.test.ts](room.test.ts) is the one to keep honest: it asserts that a player's view names **exactly two** characters — their own — and that the court and undo stack never reach the wire, then walks every authorization rule for both games.

Coup's suite covers each challenge and block branch, then fuzzes 400 random-but-legal games across 2–6 players, asserting at every step that all 15 cards are accounted for exactly once and that every game terminates with a single survivor.
