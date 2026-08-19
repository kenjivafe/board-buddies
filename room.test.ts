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
import {
  actorsOf,
  centreSlots,
  initialState as wwInitial,
  reducer as wwReducer,
} from "./lib/werewolf/reducer";
import { ROLES } from "./lib/werewolf/roles";
import type { OnuwState, Role as WwRole } from "./lib/werewolf/types";
import { RoomError, type RoomPhase, type Seat } from "./lib/room/types";

/** A full lineup record from just the roles you care about. */
const wwLineup = (counts: Partial<Record<WwRole, number>>): Record<WwRole, number> => ({
  ...(Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<WwRole, number>),
  ...counts,
});

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
// answering a challenge is the challenged player's alone
// ============================================================

{
  const opened = reducer(coupGame("Ana", "Ben", "Cleo"), { type: "ACT", action: "tax" });
  const called = reducer(opened, { type: "CHALLENGE", challengerId: "p1" });
  check(called.phase === "showdown", "a challenge parks on a showdown");

  denies(
    () => coup.apply(called, { type: "REVEAL" }, "p1", false),
    "the challenger cannot answer the challenge they made"
  );
  denies(
    () => coup.apply(called, { type: "REVEAL" }, "p2", true),
    "a bystander cannot answer it either"
  );
  allows(
    () => coup.apply(called, { type: "REVEAL" }, "p0", false),
    "the challenged player answers their own"
  );
}

{
  // The showdown must not betray the answer. Build the same challenge twice —
  // once where the claim is true, once where it is a bluff — and check that a
  // watcher's view of the two is byte-for-byte identical.
  // one shared base, so the only difference between the two is the answer —
  // dealing twice would vary the watcher's own hand and prove nothing
  const base = coupGame("Ana", "Ben", "Cleo");
  const build = (holds: boolean) => {
    const s: CoupState = JSON.parse(JSON.stringify(base));
    s.players[0].cards = [
      { id: "x0", character: holds ? "duke" : "captain", revealed: false },
      { id: "x1", character: "contessa", revealed: false },
    ];
    return reducer(reducer(s, { type: "ACT", action: "tax" }), {
      type: "CHALLENGE",
      challengerId: "p1",
    });
  };

  const truthful = viewFor(build(true), "p1");
  const bluffing = viewFor(build(false), "p1");
  check(
    JSON.stringify(truthful.showdown) === JSON.stringify(bluffing.showdown),
    "the showdown reads the same whether or not the claim is true"
  );
  check(
    JSON.stringify(truthful) === JSON.stringify(bluffing),
    "and so does the whole watcher view — nothing leaks the answer"
  );
  check(truthful.showdown?.claim === "duke", "the claim itself is public, as it should be");

  // the claimant's own device can work it out, because it holds their hand
  const own = viewFor(build(true), "p0");
  const ownCards = own.players.find((p) => p.id === "p0")!.cards;
  check(
    ownCards.some((c) => c.character === "duke"),
    "the challenged player can see their own answer"
  );
}

// ============================================================
// restarting must never strand a room
// ============================================================

{
  // RESTART deals again through START, which lands in the pass-and-peek deal
  // round — a phase rooms refuse to advance, so the game would show no panel
  // and offer no legal move. Every state the adapter hands back must be live.
  const state = coupGame("Ana", "Ben", "Cleo");
  const restarted = coup.apply(state, { type: "RESTART" }, "p0", true) as CoupState;
  check(restarted.phase === "turn", `a restarted room is playable, not "${restarted.phase}"`);
  check(
    restarted.players.every((p) => p.cards.length === 2 && p.cards.every((c) => !c.revealed)),
    "everyone is dealt a fresh pair"
  );
  check(!coup.atSetup(restarted), "a restart does not read as a return to setup");

  // and the same again from a finished game, which is where the button lives
  let ended = coupGame("Ana", "Ben");
  ended = JSON.parse(JSON.stringify(ended));
  ended.players[0].coins = 7;
  ended.players[1].cards[1].revealed = true;
  ended = reducer(ended, { type: "ACT", action: "coup", targetId: "p1" });
  check(ended.phase === "ended", "the game ends");
  const again = coup.apply(ended, { type: "RESTART" }, "p0", true) as CoupState;
  check(again.phase === "turn", `restarting after a win is playable, not "${again.phase}"`);

  // King's Cup restarts straight into play, but assert it rather than assume
  const kc = kings.start(seats("Ana", "Ben"), { kingMode: "cup" }) as KcState;
  const kcAgain = kings.apply(kc, { type: "RESTART" }, "p0", true) as KcState;
  check(kcAgain.phase === "playing", `King's Cup restarts playable, not "${kcAgain.phase}"`);
  check(kcAgain.deck.length === 52, "a fresh deck");

  // "change players" is what sends a room back to its lobby
  check(coup.atSetup(coup.apply(state, { type: "NEW_GAME" }, "p0", true)), "Coup NEW_GAME returns to setup");
  check(kings.atSetup(kings.apply(kc, { type: "NEW_GAME" }, "p0", true)), "King's Cup NEW_GAME returns to setup");

  // no state the adapter can produce should ever be a dead end
  for (const [name, produced] of [
    ["start", coup.start(seats("A", "B"), {})],
    ["restart", restarted],
    ["restart-after-win", again],
  ] as const) {
    check(
      (produced as CoupState).phase !== "deal",
      `${name} never hands a room the deal phase`
    );
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

// ---------- Werewolf (One Night) ----------

{
  const wolves = adapterFor("werewolf");
  const village = seats("Ana", "Ben", "Cleo", "Dev", "Eve");
  // five players, so the box must hold exactly eight cards
  const box = wwLineup({
    werewolf: 1,
    seer: 1,
    robber: 1,
    troublemaker: 1,
    witch: 1,
    prince: 1,
    villager: 2,
  });

  // the host names the cards, so the host is exactly who must not be trusted
  denies(
    () => wolves.start(village, { lineup: wwLineup({ werewolf: 1, villager: 3, seer: 1, tanner: 1 }) }),
    "a box of six for five players is refused — the middle needs three of its own"
  );
  denies(
    () => wolves.start(village, { lineup: wwLineup({ werewolf: 1, mason: 1, villager: 3, seer: 1, tanner: 1, prince: 1 }) }),
    "and a lone Mason is refused"
  );
  denies(() => wolves.start(village, {}), "a room cannot start with no box at all");
  denies(
    () => wolves.start(village, { lineup: wwLineup({ werewolf: 3, villager: 3, seer: 1, tanner: 1 }) }),
    "a third werewolf is not in the box, whoever asks"
  );

  const opened = wolves.start(village, { lineup: box, discussionSeconds: 300 }) as OnuwState;
  check(opened.phase === "night", `a room starts at the night, not in ${opened.phase}`);
  check(opened.slots.length === 8, "five seats and three in the middle");
  check(
    opened.players.every((p, i) => p.dealt === opened.slots[i]),
    "the deal is walked through rather than rendered"
  );

  /**
   * The deal is shuffled, so which cards reach players is up to chance. The
   * authorization walk below needs to know exactly who holds what, so it forces
   * the seating and re-opens the night through the reducer.
   */
  const forced: WwRole[] = [
    "werewolf",
    "seer",
    "robber",
    "witch",
    "villager",
    "troublemaker",
    "prince",
    "villager",
  ];
  const seeded = wwReducer(wwInitial(), {
    type: "START",
    players: village.map((s) => ({ id: s.id, name: s.name })),
    lineup: box,
    discussionSeconds: 300,
  });
  let state = {
    ...seeded,
    slots: forced,
    players: seeded.players.map((p, i) => ({ ...p, dealt: forced[i] })),
  } as OnuwState;
  while (state.phase === "deal") state = wwReducer(state, { type: "DEAL_NEXT" });

  const dealt = (role: WwRole) => state.players.find((p) => p.dealt === role)!.id;
  const wolf = dealt("werewolf");
  const seer = dealt("seer");
  const stranger = dealt("villager");

  check(state.step === "werewolf", "and lands on the pack");

  denies(
    () => wolves.apply(state, { type: "DEAL_NEXT" }, wolf, true),
    "nobody walks the deal along in a room"
  );
  denies(
    () => wolves.apply(state, { type: "UNDO" }, wolf, true),
    "undo would rewind cards people have already been shown"
  );
  denies(
    () => wolves.apply(state, { type: "WAKE_ACK", playerId: wolf }, stranger, true),
    "you cannot answer on somebody else's behalf"
  );
  denies(
    () => wolves.apply(state, { type: "WAKE_ACK", playerId: stranger }, stranger, true),
    "and nothing woke you if you were dealt a villager"
  );
  allows(
    () => wolves.apply(state, { type: "WAKE_ACK", playerId: wolf }, wolf, false),
    "the wolf may answer for themselves"
  );

  // every acting role is checked against the card that seat was actually dealt
  denies(
    () => wolves.apply(state, { type: "SEER", targetId: wolf, centreSlots: [] }, seer, false),
    "the seer cannot jump the queue while the pack is still up"
  );

  const night = wolves.apply(state, { type: "WAKE_ACK", playerId: wolf }, wolf, false) as OnuwState;
  check(night.step === "seer", "the pack answers and the seer is next");
  denies(
    () => wolves.apply(night, { type: "SEER", targetId: wolf, centreSlots: [] }, stranger, false),
    "a reading is not somebody else's to take"
  );
  allows(
    () => wolves.apply(night, { type: "SEER", targetId: wolf, centreSlots: [] }, seer, false),
    "but it is the seer's"
  );

  // walk the rest of the night, checking each actor as we go
  let live = wolves.apply(
    night,
    { type: "SEER", targetId: wolf, centreSlots: [] },
    seer,
    false
  ) as OnuwState;

  let guard = 0;
  while (live.phase === "night" && guard++ < 20) {
    const step = live.step!;
    const actor = actorsOf(live, step)[0];
    const impostor = live.players.find((p) => p.id !== actor.id)!.id;
    const centre = centreSlots(live);

    const action =
      step === "robber"
        ? { type: "ROBBER", targetId: null }
        : step === "witch"
          ? { type: "WITCH_PASS" }
          : step === "troublemaker"
            ? { type: "TROUBLEMAKER", aId: null, bId: null }
            : step === "drunk"
              ? { type: "DRUNK", centreSlot: centre[0] }
              : step === "insomniac"
                ? { type: "INSOMNIAC" }
                : { type: "WAKE_ACK", playerId: actor.id };

    denies(
      () => wolves.apply(live, action, impostor, true),
      `${step}: nobody else may act on it, host or not`
    );
    live = wolves.apply(live, action, actor.id, false) as OnuwState;
  }
  check(live.phase === "day", `the night runs out into the day, saw ${live.phase}`);

  // daylight
  denies(() => wolves.apply(live, { type: "OPEN_VOTE" }, wolf, false), "only the host calls the vote");
  denies(() => wolves.apply(live, { type: "NEW_GAME" }, wolf, false), "only the host deals again");

  const open = wolves.apply(live, { type: "OPEN_VOTE" }, wolf, true) as OnuwState;
  check(open.phase === "vote", "the host opens the ballot");
  denies(
    () => wolves.apply(open, { type: "VOTE", voterId: wolf, targetId: seer }, seer, false),
    "you cannot point somebody else's finger"
  );
  allows(
    () => wolves.apply(open, { type: "VOTE", voterId: wolf, targetId: seer }, wolf, false),
    "you may point your own"
  );

  // the view a seated player gets is the redacted one
  const theirs = wolves.view(state, stranger) as { self: { notes: unknown[] } };
  const seen = JSON.stringify(theirs);
  check(!seen.includes('"past"'), "the undo stack never reaches the wire");
  check(!seen.includes('"slots"'), "nor does the map of where every card is");
  // exactly one notebook travels, and it is the viewer's own
  check(
    (seen.match(/"notes":/g) ?? []).length === 1 && theirs.self.notes.length === 1,
    "nor anybody else's notebook"
  );
  const scrubbed = JSON.stringify({ ...(wolves.view(state, stranger) as object), lineup: null });
  check(
    !scrubbed.includes("werewolf"),
    "and outside the box, the pack is never named to its neighbours"
  );
}

// ---------- clearing out a seat nobody is sitting in ----------

/**
 * "Leave room" only works for somebody still looking at the page. Close the
 * tab and the seat stays — and then the game deals it a hand and waits on it.
 * The host's ✕ is the way out of that, so the rules around it are worth
 * pinning down even though the route itself needs Redis to run.
 */
{
  const room = {
    code: "ABCD",
    game: "coup" as const,
    phase: "lobby" as RoomPhase,
    hostId: "p0",
    seats: seats("Ana", "Ben", "Cleo"),
    state: null,
    createdAt: 0,
    version: 1,
  };

  /** The rule the route applies, lifted out so it can be checked in isolation. */
  const drop = (current: typeof room, byId: string, seatId: string) => {
    if (current.hostId !== byId) throw new RoomError("forbidden", "Only the host.", 403);
    if (current.phase !== "lobby") throw new RoomError("already-started", "Too late.", 409);
    if (seatId === current.hostId) throw new RoomError("bad-action", "Not yourself.", 400);
    const remaining = current.seats.filter((s) => s.id !== seatId);
    if (remaining.length === current.seats.length) {
      throw new RoomError("not-found", "Already gone.", 404);
    }
    return { ...current, seats: remaining };
  };

  denies(() => drop(room, "p1", "p2"), "a guest cannot remove anybody");
  denies(() => drop(room, "p0", "p0"), "the host cannot remove themselves");
  denies(() => drop(room, "p0", "nobody"), "a seat that has already gone is refused");
  denies(
    () => drop({ ...room, phase: "playing" as RoomPhase }, "p0", "p1"),
    "and nobody is removed once the game is running"
  );

  allows(() => drop(room, "p0", "p1"), "the host may clear out a guest's seat");
  const after = drop(room, "p0", "p1");
  check(after.seats.length === 2, "the seat is gone");
  check(!after.seats.some((s) => s.id === "p1"), "and it is the right one");
  check(after.hostId === "p0", "the host is unchanged");

  // the point of all this: the dealt game must not include them
  const dealt = coup.start(after.seats, {}) as CoupState;
  check(dealt.players.length === 2, `a dropped seat is not dealt in, saw ${dealt.players.length}`);
  check(
    !dealt.players.some((p) => p.id === "p1"),
    "and the game never waits on somebody who left"
  );
}

if (failures === 0) console.log("ALL ROOM TESTS PASSED");
else {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
}
