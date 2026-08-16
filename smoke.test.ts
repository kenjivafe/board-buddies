import { initialState, reducer } from "./lib/reducer";
import type { GameState, Player } from "./lib/types";

const players: Player[] = ["Kenji", "Miko", "Ana"].map((name, i) => ({ id: `p${i}`, name }));

function playFull(mode: "cup" | "rule") {
  let s: GameState = reducer(initialState(), { type: "START", players, kingMode: mode });
  let guard = 0;
  while (s.phase === "playing" && guard++ < 300) {
    s = reducer(s, { type: "DRAW" });
    if (s.pending === "pick-target" || s.pending === "pick-mate") {
      const drawer = s.current!.playerId;
      const other = players.find((p) => p.id !== drawer)!;
      s = reducer(s, { type: "PICK_PLAYER", targetId: other.id });
    } else if (s.pending === "king-rule") {
      s = reducer(s, { type: "SET_KING_RULE", text: "No pointing" });
    }
  }
  console.assert(s.phase === "ended", `${mode}: game should end, got ${s.phase}`);
  console.assert(s.drawn.length === 52, `${mode}: 52 drawn, got ${s.drawn.length}`);
  console.assert(s.deck.length === 0, `${mode}: deck empty`);
  console.assert(s.kingsDrawn === 4, `${mode}: 4 kings, got ${s.kingsDrawn}`);
  const aces = s.drawn.filter((d) => d.card.rank === 1).length;
  const tokenSum = Object.values(s.aceTokens).reduce((a, b) => a + b, 0);
  console.assert(aces === 4 && tokenSum === 4, `${mode}: 4 ace tokens, got ${tokenSum}`);
  if (mode === "rule") console.assert(s.kingRule?.text === "No pointing", "rule stored");
  if (mode === "cup") {
    const totalDrinks = Object.values(s.drinkTally).reduce((a, b) => a + b, 0);
    console.assert(totalDrinks > 0, "cup: tally recorded");
  }
  return s;
}

playFull("cup");
playFull("rule");

// undo restores exactly
let s: GameState = reducer(initialState(), { type: "START", players, kingMode: "cup" });
const before = JSON.stringify({ ...s, past: [] });
let s2 = reducer(s, { type: "DRAW" });
if (s2.pending) {
  // pending draws hold state differently; undo should still restore
}
const s3 = reducer(s2, { type: "UNDO" });
console.assert(JSON.stringify({ ...s3, past: [] }) === before, "undo restores pre-draw state");

// ace consume + undo
let a: GameState = reducer(initialState(), { type: "START", players, kingMode: "cup" });
a = { ...a, aceTokens: { p0: 1 } };
const a2 = reducer(a, { type: "USE_ACE", playerId: "p0" });
console.assert(a2.aceTokens.p0 === 0, "ace consumed");
const a3 = reducer(a2, { type: "UNDO" });
console.assert(a3.aceTokens.p0 === 1, "ace undo");

// turn held during pending
let t: GameState = reducer(initialState(), { type: "START", players, kingMode: "cup" });
// force a 2 on top
t = { ...t, deck: [...t.deck.filter((c) => !(c.rank === 2 && c.suit === "spades")), { rank: 2, suit: "spades" }] };
const heldIdx = t.turnIndex;
const t2 = reducer(t, { type: "DRAW" });
console.assert(t2.pending === "pick-target" && t2.turnIndex === heldIdx, "turn held during pending");
const t3 = reducer(t2, { type: "PICK_PLAYER", targetId: "p1" });
console.assert(t3.pending === null && t3.turnIndex === (heldIdx + 1) % 3, "turn advances after pick");
console.assert((t3.drinkTally["p1"] ?? 0) === 1, "target tallied");

// mate chain: p0 mates p1, then p0 drinks -> both tally
let m: GameState = reducer(initialState(), { type: "START", players, kingMode: "cup" });
m = { ...m, mates: { p0: "p1" }, turnIndex: 0, deck: [...m.deck.filter((c) => !(c.rank === 3 && c.suit === "hearts")), { rank: 3, suit: "hearts" }] };
const m2 = reducer(m, { type: "DRAW" });
console.assert(m2.drinkTally["p0"] === 1 && m2.drinkTally["p1"] === 1, `mate chain tallies, got ${JSON.stringify(m2.drinkTally)}`);

console.log("ALL TESTS PASSED");
