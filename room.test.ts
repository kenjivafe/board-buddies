import { adapterFor } from "./lib/room/engine";
import { initialState, reducer } from "./lib/coup/reducer";
import { viewFor, ALL_SEEING } from "./lib/coup/view";
import type { CoupState } from "./lib/coup/types";
import { CHARACTER_INFO } from "./lib/coup/deck";
import {
  initialState as kcInitial,
  reducer as kcReducer,
} from "./lib/kings-cup/reducer";
import type { GameState as KcState } from "./lib/kings-cup/types";
import { RoomError, type Seat } from "./lib/room/types";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

function denies(run: () => unknown, message: string) {
  try {
    run();
    check(false, `${message} — but it was allowed`);
  } catch (error) {
    check(error instanceof RoomError, `${message} — threw the wrong kind of error`);
  }
}

function allows(run: () => unknown, message: string) {
  try {
    run();
  } catch (error) {
    check(false, `${message} — but it was refused (${(error as Error).message})`);
  }
}

const seats = (...names: string[]): Seat[] =>
  names.map((name, i) => ({ id: `p${i}`, name, token: `t${i}`, joinedAt: 0 }));

const coup = adapterFor("coup");
const kings = adapterFor("kings-cup");

/**
 * Deliberately does NOT advance the phase itself. An earlier version of this
 * helper walked past the deal round, which hid the fact that the adapter was
 * leaving rooms stuck there — so the room must arrive ready to play.
 */
function coupGame(...names: string[]): CoupState {
  const s = coup.start(seats(...names), {}) as CoupState;
  check(s.phase === "turn", `a room starts ready to play, not in ${s.phase}`);
  return s;
}

// ============================================================
// redaction — a leak here silently defeats the whole game
// ============================================================

{
  const state = coupGame("Ana", "Ben", "Cleo");
  const view = viewFor(state, "p0");

  check(view.selfId === "p0", "the view names its viewer");
  check(view.omniscient === false, "a room view is not all-seeing");

  // own cards are known
  const mine = view.players.find((p) => p.id === "p0")!;
  check(
    mine.cards.every((c) => c.character !== null),
    "you can see both of your own influences"
  );

  // everyone else's are not
  for (const id of ["p1", "p2"]) {
    const them = view.players.find((p) => p.id === id)!;
    check(
      them.cards.every((c) => c.character === null),
      `${id}'s face-down cards are withheld`
    );
    check(them.cards.length === 2, `${id} still shows two card slots`);
    check(typeof them.coins === "number", `${id}'s coins stay public`);
  }

  // the court is a count, never a list
  check(view.courtCount === state.court.length, "the court is reported as a count");
  check(!("court" in view), "the court's contents are not in the payload");
  check(!("past" in view), "the undo stack is not in the payload");

  // The strongest form of the check: how many characters can be recovered from
  // the wire at all? Exactly your own two, and nothing else.
  const wire = JSON.stringify(view);
  const namesOnWire = Object.keys(CHARACTER_INFO).filter((key) =>
    new RegExp(`"${key}"`).test(wire)
  );
  const ownCharacters = new Set(state.players[0].cards.map((c) => c.character));
  check(
    namesOnWire.every((n) => ownCharacters.has(n as never)),
    `only your own characters reach the wire, saw ${namesOnWire.join()}`
  );
  const recoverable = (wire.match(/"character":"[a-z]+"/g) ?? []).length;
  check(recoverable === 2, `exactly two characters are named, saw ${recoverable}`);
}

{
  // a spent influence is public, so everyone may name it
  let state = coupGame("Ana", "Ben");
  state = JSON.parse(JSON.stringify(state));
  state.players[1].cards[0].revealed = true;
  const view = viewFor(state, "p0");
  const them = view.players.find((p) => p.id === "p1")!;
  check(them.cards[0].character !== null, "a spent card is public");
  check(them.cards[1].character === null, "their remaining card stays hidden");
}

{
  // the drawn pair belongs to the exchanging player alone
  let state = coupGame("Ana", "Ben", "Cleo");
  state = reducer(state, { type: "ACT", action: "exchange" });
  state = reducer(state, { type: "PASS", playerId: "p1" });
  state = reducer(state, { type: "PASS", playerId: "p2" });
  check(state.phase === "exchange", "both passes carried the exchange through");

  const actorView = viewFor(state, "p0");
  const otherView = viewFor(state, "p1");
  check(actorView.exchangeDraw.length === 2, "the exchanging player sees the two drawn");
  check(otherView.exchangeDraw.length === 0, "nobody else sees the drawn pair");
}

{
  // one-device play legitimately holds everything
  const state = coupGame("Ana", "Ben");
  const view = viewFor(state, ALL_SEEING);
  check(view.omniscient, "the shared-screen view is all-seeing");
  check(view.selfId === null, "the shared screen belongs to nobody in particular");
  check(
    view.players.every((p) => p.cards.every((c) => c.character !== null)),
    "one device sees every hand"
  );
}

// ============================================================
// authorization — the client is never trusted
// ============================================================

{
  const state = coupGame("Ana", "Ben", "Cleo");
  const turnId = state.players[state.turnIndex].id;
  const other = state.players.find((p) => p.id !== turnId)!.id;

  allows(() => coup.apply(state, { type: "ACT", action: "income" }, turnId, true), "the current player may act");
  denies(
    () => coup.apply(state, { type: "ACT", action: "income" }, other, false),
    "acting out of turn is refused"
  );

  denies(
    () => coup.apply(state, { type: "UNDO" }, turnId, true),
    "undo is refused in a room, even for the host"
  );
  denies(
    () => coup.apply(state, { type: "ALLOW" }, other, false),
    "one device cannot speak for the table in a room"
  );
  denies(
    () => coup.apply(state, { type: "DEAL_NEXT" }, turnId, true),
    "walking the deal along is refused in a room"
  );
  denies(
    () => coup.apply(state, { type: "RESTART" }, other, false),
    "only the host may restart"
  );
  allows(() => coup.apply(state, { type: "RESTART" }, turnId, true), "the host may restart");
}

{
  // reactions: you answer for yourself and nobody else
  const opened = reducer(coupGame("Ana", "Ben", "Cleo"), { type: "ACT", action: "tax" });
  check(opened.phase === "reaction", "tax opens a reaction");

  denies(
    () => coup.apply(opened, { type: "PASS", playerId: "p2" }, "p1", false),
    "passing on someone else's behalf is refused"
  );
  allows(
    () => coup.apply(opened, { type: "PASS", playerId: "p1" }, "p1", false),
    "passing for yourself is allowed"
  );
  denies(
    () => coup.apply(opened, { type: "CHALLENGE", challengerId: "p2" }, "p1", false),
    "challenging in someone else's name is refused"
  );
  denies(
    () => coup.apply(opened, { type: "CHALLENGE", challengerId: "p0" }, "p0", false),
    "the actor cannot challenge their own claim"
  );
  allows(
    () => coup.apply(opened, { type: "CHALLENGE", challengerId: "p1" }, "p1", false),
    "a responder may challenge"
  );
  denies(
    () => coup.apply(opened, { type: "BLOCK", blockerId: "p2", claim: "duke" }, "p1", false),
    "blocking in someone else's name is refused"
  );
}

{
  // giving up an influence is only ever your own call
  let state = coupGame("Ana", "Ben", "Cleo");
  state = JSON.parse(JSON.stringify(state));
  state.players[0].coins = 7;
  const couped = reducer(state, { type: "ACT", action: "coup", targetId: "p1" });
  check(couped.reveal?.playerId === "p1", "the coup lands on Ben");
  const card = couped.players[1].cards[0].id;

  denies(
    () => coup.apply(couped, { type: "LOSE", cardId: card }, "p0", true),
    "you cannot surrender another player's influence"
  );
  allows(
    () => coup.apply(couped, { type: "LOSE", cardId: card }, "p1", false),
    "the struck player surrenders their own"
  );
}

{
  // an exchange belongs to whoever called it
  let state = coupGame("Ana", "Ben", "Cleo");
  state = reducer(state, { type: "ACT", action: "exchange" });
  state = reducer(state, { type: "PASS", playerId: "p1" });
  state = reducer(state, { type: "PASS", playerId: "p2" });
  const ids = [...state.players[0].cards, ...state.exchangeDraw].slice(0, 2).map((c) => c.id);
  denies(
    () => coup.apply(state, { type: "EXCHANGE_KEEP", cardIds: ids }, "p1", false),
    "you cannot resolve someone else's exchange"
  );
  allows(
    () => coup.apply(state, { type: "EXCHANGE_KEEP", cardIds: ids }, "p0", false),
    "the ambassador resolves their own"
  );
}

// ---------- King's Cup ----------

{
  const state = kings.start(seats("Ana", "Ben", "Cleo"), { kingMode: "cup" }) as KcState;
  check(state.phase === "playing", "King's Cup starts dealt");
  const turnId = state.players[state.turnIndex].id;
  const other = state.players.find((p) => p.id !== turnId)!.id;

  allows(() => kings.apply(state, { type: "DRAW" }, turnId, false), "the player up next may draw");
  denies(() => kings.apply(state, { type: "DRAW" }, other, false), "drawing out of turn is refused");
  denies(
    () => kings.apply(state, { type: "USE_ACE", playerId: other }, turnId, true),
    "spending someone else's trump card is refused"
  );
  denies(() => kings.apply(state, { type: "UNDO" }, other, false), "only the host may undo");
  allows(() => kings.apply(state, { type: "UNDO" }, other, true), "the host may undo");

  // every card in this game is public, so the view withholds only the undo stack
  const view = kings.view(state, "p1") as Record<string, unknown>;
  check(!("past" in view), "King's Cup views drop the undo stack");
  check("deck" in view && "drawn" in view, "everything else stays public");
}

{
  // only the player who drew resolves the card in front of them
  let state = kings.start(seats("Ana", "Ben", "Cleo"), { kingMode: "rule" }) as KcState;
  let guard = 0;
  while (state.pending !== "pick-target" && guard++ < 60) {
    const turnId = state.players[state.turnIndex].id;
    state = kings.apply(state, { type: "DRAW" }, turnId, false) as KcState;
    if (state.pending === "king-rule") {
      state = kings.apply(
        state,
        { type: "SET_KING_RULE", text: "No names" },
        state.current!.playerId,
        false
      ) as KcState;
    } else if (state.pending === "pick-mate") {
      const drawer = state.current!.playerId;
      const mate = state.players.find((p) => p.id !== drawer)!.id;
      state = kings.apply(state, { type: "PICK_PLAYER", targetId: mate }, drawer, false) as KcState;
    }
    if (state.phase === "ended") break;
  }

  if (state.pending === "pick-target") {
    const drawer = state.current!.playerId;
    const bystander = state.players.find((p) => p.id !== drawer)!.id;
    denies(
      () => kings.apply(state, { type: "PICK_PLAYER", targetId: bystander }, bystander, true),
      "a bystander cannot resolve someone else's card"
    );
    allows(
      () => kings.apply(state, { type: "PICK_PLAYER", targetId: bystander }, drawer, false),
      "the drawer resolves their own card"
    );
  } else {
    check(false, "never reached a pick-target card to test");
  }
}

// ============================================================
// the pass flow: an action waits for every responder
// ============================================================

{
  let state = reducer(coupGame("Ana", "Ben", "Cleo"), { type: "ACT", action: "tax" });
  const before = state.players[0].coins;

  state = reducer(state, { type: "PASS", playerId: "p1" });
  check(state.phase === "reaction", "one pass is not enough with two opponents");
  check(state.players[0].coins === before, "nothing resolves until everyone answers");
  check(state.pending!.passed.length === 1, "the pass is recorded");

  const repeat = reducer(state, { type: "PASS", playerId: "p1" });
  check(repeat === state, "passing twice changes nothing");
  const stranger = reducer(state, { type: "PASS", playerId: "p0" });
  check(stranger === state, "the actor is not a responder");

  state = reducer(state, { type: "PASS", playerId: "p2" });
  check(state.players[0].coins === before + 3, "the last pass lets the tax through");
  check(state.turnIndex === 1, "and play moves on");
}

{
  // a block resets the question, so earlier passes do not carry over
  let state = reducer(coupGame("Ana", "Ben", "Cleo"), { type: "ACT", action: "foreign_aid" });
  state = reducer(state, { type: "PASS", playerId: "p1" });
  check(state.pending!.passed.length === 1, "a pass on the aid is recorded");
  state = reducer(state, { type: "BLOCK", blockerId: "p2", claim: "duke" });
  check(state.phase === "block", "the block opens its own question");
  check(state.pending!.passed.length === 0, "passes on the action do not count as passes on the block");

  // now only Ana and Ben may answer the block — Cleo is the blocker
  state = reducer(state, { type: "PASS", playerId: "p0" });
  check(state.phase === "block", "the block still stands open");
  state = reducer(state, { type: "PASS", playerId: "p1" });
  check(state.players[0].coins === 2, "a standing Duke block denies the aid");
  check(state.turnIndex === 1, "play moves on after the block stands");
}

{
  // head to head there is a single responder, so one pass resolves it
  let state = reducer(coupGame("Ana", "Ben"), { type: "ACT", action: "tax" });
  const before = state.players[0].coins;
  state = reducer(state, { type: "PASS", playerId: "p1" });
  check(state.players[0].coins === before + 3, "one opponent, one pass");
}

if (failures === 0) console.log("ALL ROOM TESTS PASSED");
else {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
}
