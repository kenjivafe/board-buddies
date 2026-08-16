# King's Cup

The drinking card game as a pass-around phone app. Built with Next.js 14 (App Router) + TypeScript, zero runtime dependencies beyond React.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Deploys to Vercel as-is (`vercel` or connect the repo — no config needed).

## Rules implemented

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

## QoL

- Seat order = table order; 4/5 resolve the actual neighbor's name
- Persistent status rail: masters, active rule / cup meter, trump holders, mate chains
- Undo (30-step snapshot stack), draw history sheet, reshuffle with confirmation
- localStorage autosave with a resume prompt after refresh
- Drink tally + end-of-deck leaderboard (counts explicitly assigned drinks)
- Reduced-motion respected, one-hand mobile layout

## Logic tests

```bash
npx tsx smoke.test.ts
```
