import { buildCourt, CHARACTER_INFO, shuffle } from "./deck";
import { ACTIONS, claimText, isAlive, responders } from "./rules";
import type {
  ActionKind,
  Beat,
  Character,
  CoupPlayer,
  CoupState,
  InfluenceCard,
  LogKind,
  AudioCue,
  RevealThen,
  Showdown,
} from "./types";

export const STORAGE_KEY = "coup-v1";
const UNDO_LIMIT = 30;
const LOG_LIMIT = 60;
const BEAT_LIMIT = 6;
const CUE_LIMIT = 8;
const STARTING_COINS = 2;

export type Action =
  | { type: "START"; players: { id: string; name: string }[]; openerId?: string }
  | { type: "DEAL_NEXT" }
  | { type: "ACT"; action: ActionKind; targetId?: string }
  /** nobody challenged (reaction) or nobody challenged the block (block) */
  | { type: "ALLOW" }
  /** one responder declines to object; the action waits for the rest */
  | { type: "PASS"; playerId: string }
  | { type: "CHALLENGE"; challengerId: string }
  /** the challenged player answers: prove the claim, or concede it */
  | { type: "REVEAL"; concede?: boolean }
  | { type: "BLOCK"; blockerId: string; claim: Character }
  | { type: "LOSE"; cardId: string }
  | { type: "EXCHANGE_KEEP"; cardIds: string[] }
  | { type: "UNDO" }
  | { type: "RESTART" }
  /* eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents */
  | { type: "NEW_GAME" }
  | { type: "HYDRATE"; state: CoupState };

export function initialState(): CoupState {
  return {
    phase: "setup",
    players: [],
    court: [],
    turnIndex: 0,
    pending: null,
    reveal: null,
    showdown: null,
    exchangeDraw: [],
    dealIndex: 0,
    log: [],
    beats: [],
    cues: [],
    cueSeq: 0,
    winnerId: null,
    past: [],
  };
}

function snapshot(state: CoupState): string {
  const { past, ...rest } = state;
  return JSON.stringify(rest);
}

function pushPast(state: CoupState): string[] {
  const past = [...state.past, snapshot(state)];
  return past.length > UNDO_LIMIT ? past.slice(-UNDO_LIMIT) : past;
}

/** The state tree nests players → cards, so work on a copy and mutate it freely. */
function draft(state: CoupState): CoupState {
  return JSON.parse(JSON.stringify(state)) as CoupState;
}

function find(d: CoupState, id: string | null): CoupPlayer | null {
  if (!id) return null;
  return d.players.find((p) => p.id === id) ?? null;
}

function say(d: CoupState, text: string, kind: LogKind) {
  d.log = [...d.log, { text, kind }].slice(-LOG_LIMIT);
}

/** Records a step in the story of the action currently on the table. */
function beat(
  d: CoupState,
  kind: Beat["kind"],
  text: string,
  character: Character | null = null,
  fate: Beat["fate"] = null,
  who: string | null = null,
  replacedId: string | null = null
) {
  d.beats = [...d.beats, { kind, text, character, fate, who, replacedId }].slice(-BEAT_LIMIT);
}

/**
 * Raise a voice line. Only ever called for something already public — see the
 * note on AudioCue. Nothing here may name a character whose card is still down.
 */
function cue(d: CoupState, path: string) {
  d.cueSeq += 1;
  d.cues = [...d.cues, { id: d.cueSeq, path }].slice(-CUE_LIMIT);
}

function name(d: CoupState, id: string | null): string {
  return find(d, id)?.name ?? "someone";
}

// ---------- flow ----------

/** Ends the game the moment only one influence-holder is left standing. */
function checkWin(d: CoupState): boolean {
  const alive = d.players.filter(isAlive);
  if (alive.length > 1) return false;
  d.phase = "ended";
  d.winnerId = alive[0]?.id ?? null;
  d.pending = null;
  d.reveal = null;
  d.showdown = null;
  d.exchangeDraw = [];
  if (alive[0]) say(d, `${alive[0].name} is the last one holding power.`, "out");
  return true;
}

function advanceTurn(d: CoupState) {
  d.pending = null;
  d.reveal = null;
  d.showdown = null;
  d.exchangeDraw = [];
  if (checkWin(d)) return;
  let i = d.turnIndex;
  for (let n = 0; n < d.players.length; n++) {
    i = (i + 1) % d.players.length;
    if (isAlive(d.players[i])) break;
  }
  d.turnIndex = i;
  d.phase = "turn";
  say(d, `${d.players[i].name} to act.`, "turn");
}

/**
 * Ask `playerId` to surrender an influence. With one card left there is no
 * decision to make, so it flips on the spot.
 */
function requestReveal(
  d: CoupState,
  playerId: string,
  reason: string,
  then: RevealThen,
  landCue: string | null = null
) {
  const player = find(d, playerId);
  const live = player?.cards.filter((c) => !c.revealed) ?? [];
  if (!player || live.length === 0) {
    // already eliminated — nothing left to take
    if (then === "resolve") resolveAction(d);
    else advanceTurn(d);
    return;
  }
  if (live.length === 1) {
    // no choice to make, so the blow lands in the same breath
    loseCard(d, playerId, live[0].id, then, landCue);
    return;
  }
  d.reveal = { playerId, reason, then, landCue };
  d.phase = "reveal";
}

function loseCard(
  d: CoupState,
  playerId: string,
  cardId: string,
  then: RevealThen,
  landCue: string | null = null
) {
  const player = find(d, playerId);
  const card = player?.cards.find((c) => c.id === cardId);
  if (!player || !card || card.revealed) return;
  card.revealed = true;
  d.reveal = null;
  // the action lands first, then the card it took speaks
  if (landCue) cue(d, landCue);
  const surrendered = CHARACTER_INFO[card.character].name;
  say(d, `${player.name} turns over the ${surrendered}.`, "loss");
  beat(d, "surrender", `${player.name} gives up the ${surrendered}.`, card.character, "spent", player.name);
  // the card is face up now, so it is allowed to speak — and its last breath
  // is a different line from merely being wounded
  cue(d, `${card.character}/${isAlive(player) ? "loss" : "final_loss"}`);
  if (!isAlive(player)) {
    say(d, `${player.name} is out.`, "out");
    beat(d, "out", `${player.name} is out of the game.`, null, null, player.name);
  }
  if (checkWin(d)) return;
  if (then === "resolve") resolveAction(d);
  else advanceTurn(d);
}

/** Puts a proven card back in the court, shuffles, and draws a replacement. */
function swapProvenCard(d: CoupState, playerId: string, cardId: string): string | null {
  const player = find(d, playerId);
  if (!player) return null;
  const index = player.cards.findIndex((c) => c.id === cardId);
  if (index < 0) return null;
  const pool = shuffle([...d.court, player.cards[index]]);
  player.cards[index] = pool[0];
  d.court = pool.slice(1);
  // reported so the end screen can show the card that was proven, rather than
  // whatever happened to be drawn after it
  return pool[0].id;
}

/** assassinate reads better as a noun in the narrator's mouth */
const verbFor = (kind: ActionKind) => (kind === "assassinate" ? "assassination" : kind);

/**
 * The narrator closes an action that succeeded on a claim nobody proved. If a
 * challenge turned the card face up, the character has already spoken for the
 * action and the narrator stays out of it.
 */
function resolveCue(d: CoupState) {
  const pending = d.pending;
  if (!pending || pending.claimProven) return;
  // Income alone can be neither blocked, challenged nor delayed, so the claim
  // line is the whole event and there is no second beat to narrate.
  if (pending.action === "income") return;
  cue(d, `narrator/resolve_${verbFor(pending.action)}`);
}

/** Carries out the pending action now that nobody has stopped it. */
function resolveAction(d: CoupState) {
  const pending = d.pending;
  if (!pending) {
    advanceTurn(d);
    return;
  }
  const actor = find(d, pending.actorId);
  const target = find(d, pending.targetId);
  if (!actor) {
    advanceTurn(d);
    return;
  }

  switch (pending.action) {
    case "income":
      resolveCue(d);
      actor.coins += 1;
      say(d, `${actor.name} takes 1 coin.`, "action");
      advanceTurn(d);
      return;

    case "foreign_aid":
      resolveCue(d);
      actor.coins += 2;
      say(d, `${actor.name} takes 2 in foreign aid.`, "action");
      advanceTurn(d);
      return;

    case "tax":
      resolveCue(d);
      actor.coins += 3;
      say(d, `${actor.name} taxes the court for 3.`, "action");
      advanceTurn(d);
      return;

    case "steal": {
      if (!target || !isAlive(target)) {
        advanceTurn(d);
        return;
      }
      resolveCue(d);
      const amount = Math.min(2, target.coins);
      target.coins -= amount;
      actor.coins += amount;
      say(
        d,
        amount === 0
          ? `${target.name} had nothing to steal.`
          : `${actor.name} steals ${amount} from ${target.name}.`,
        "action"
      );
      advanceTurn(d);
      return;
    }

    case "exchange": {
      if (!isAlive(actor)) {
        advanceTurn(d);
        return;
      }
      d.exchangeDraw = d.court.slice(0, 2);
      d.court = d.court.slice(2);
      d.phase = "exchange";
      return;
    }

    case "assassinate":
    case "coup": {
      if (!target || !isAlive(target)) {
        // the target went down earlier in the exchange of challenges
        advanceTurn(d);
        return;
      }
      const reason =
        pending.action === "coup"
          ? `${actor.name} staged a coup against you.`
          : `${actor.name}'s assassin got through.`;
      // Held back rather than raised here: these are the only actions whose
      // effect waits on the victim, so calling them done while that player is
      // still choosing a card announces a blow that has not landed yet.
      const landCue = pending.claimProven
        ? null
        : `narrator/resolve_${verbFor(pending.action)}`;
      requestReveal(d, target.id, reason, "next", landCue);
      return;
    }
  }
}

/**
 * Settle the challenge on the table, once the challenged player has answered
 * it. If the claim holds, the challenger pays; if it was a bluff, the claimant
 * pays. `onProve` / `onBluff` decide whether the original action still goes
 * ahead, which differs between challenging an actor and challenging a blocker.
 */
function settleShowdown(d: CoupState, conceded: boolean) {
  const showdown = d.showdown;
  if (!showdown) {
    advanceTurn(d);
    return;
  }
  const { claimantId, challengerId, claim, onProve, onBluff } = showdown;
  d.showdown = null;

  const claimant = find(d, claimantId);
  if (!claimant) {
    advanceTurn(d);
    return;
  }
  const held = claimant.cards.find((c) => !c.revealed && c.character === claim);
  const label = CHARACTER_INFO[claim].name;

  // Conceding never turns the claimed card over, so that influence stays face
  // down and must not speak — the narrator covers it, and whatever they
  // actually give up gets its own line.
  if (conceded) {
    say(d, `${claimant.name} concedes the ${label}.`, "challenge");
    beat(d, "concede", `${claimant.name} concedes — no ${label} shown.`);
    cue(d, "narrator/concede");
    requestReveal(d, claimantId, `You conceded to ${name(d, challengerId)}.`, onBluff);
    return;
  }

  if (held) {
    say(
      d,
      `${claimant.name} shows the ${label}. ${name(d, challengerId)} called it wrong — the ${label} goes back to the court and ${claimant.name} draws a replacement.`,
      "challenge"
    );
    // the card is genuinely turned face up here before going back in the deck,
    // so this is the one moment the table gets to see it
    const replacedId = swapProvenCard(d, claimantId, held.id);
    beat(
      d,
      "proven",
      `${claimant.name} really had the ${label}. ${name(d, challengerId)} was wrong.`,
      claim,
      "returned",
      claimant.name,
      replacedId
    );
    // face up at last, so the character may speak: first about the challenge,
    // then about whatever it was claiming to do
    cue(d, `${claim}/challenge_reveal`);
    const pending = d.pending;
    if (pending?.blockerId === claimantId && pending.blockClaim === claim) {
      cue(d, `${claim}/block_${pending.action}`);
    } else if (pending?.actorId === claimantId) {
      cue(d, `${claim}/action_${verbFor(pending.action)}`);
      // face up now, so it speaks for its own action and the narrator's
      // resolution line stays out of the way
      pending.claimProven = true;
    }
    requestReveal(d, challengerId, `You lost a challenge to ${claimant.name}.`, onProve);
  } else {
    say(d, `${claimant.name} has no ${label} — caught bluffing.`, "challenge");
    // nothing is revealed on a bluff — there was no card to show
    beat(d, "bluff", `${claimant.name} was bluffing — no ${label}.`);
    cue(d, "narrator/false_claim");
    requestReveal(d, claimantId, `${name(d, challengerId)} caught your bluff.`, onBluff);
  }
}

// ---------- reducer ----------

export function reducer(state: CoupState, action: Action): CoupState {
  switch (action.type) {
    case "START": {
      if (action.players.length < 2) return state;
      const court = buildCourt();
      /*
       * Who opens. Seat order used to decide it outright, so whoever typed
       * their name first — or joined the room first — opened every game of the
       * night, which is a real edge in a game this short. A rematch hands it
       * to whoever won instead.
       */
      const opener = action.openerId
        ? Math.max(0, action.players.findIndex((p) => p.id === action.openerId))
        : 0;
      const players: CoupPlayer[] = action.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        // head-to-head, whoever opens starts a coin short
        coins: action.players.length === 2 && i === opener ? STARTING_COINS - 1 : STARTING_COINS,
        cards: [court[i * 2], court[i * 2 + 1]],
      }));
      const d: CoupState = {
        ...initialState(),
        phase: "deal",
        players,
        turnIndex: opener,
        court: court.slice(action.players.length * 2),
      };
      // head-to-head starts the opener a coin down, so don't promise "two each"
      say(d, "Two influences each, face down.", "turn");
      return d;
    }

    case "DEAL_NEXT": {
      if (state.phase !== "deal") return state;
      const d = draft(state);
      if (d.dealIndex + 1 >= d.players.length) {
        d.dealIndex = 0;
        d.turnIndex = 0;
        d.phase = "turn";
        say(d, `${d.players[0].name} opens.`, "turn");
      } else {
        d.dealIndex += 1;
      }
      return d;
    }

    case "ACT": {
      if (state.phase !== "turn") return state;
      const info = ACTIONS[action.action];
      const actorSeat = state.players[state.turnIndex];
      if (!actorSeat || actorSeat.coins < info.cost) return state;
      if (info.needsTarget && !action.targetId) return state;

      const d = draft(state);
      d.past = pushPast(state);
      const actor = d.players[d.turnIndex];
      // assassination and coup are paid for on declaration, blocked or not
      actor.coins -= info.cost;
      d.pending = {
        actorId: actor.id,
        action: action.action,
        targetId: action.targetId ?? null,
        claim: info.claim,
        blockerId: null,
        blockClaim: null,
        passed: [],
        claimProven: false,
      };
      // name() falls back to "someone", so only resolve it when there really is a target
      const targetName = action.targetId ? name(d, action.targetId) : null;
      say(d, claimText(actor.name, action.action, targetName), "action");
      // a new action on the table starts a new story
      d.beats = [];
      d.cues = [];
      // the narrator announces the action without naming the claimed influence,
      // which is still face down and may well be a lie
      cue(d, `narrator/action_${action.action === "assassinate" ? "assassination" : action.action}`);

      // income and coup allow no argument at all
      if (action.action === "income" || action.action === "coup") resolveAction(d);
      else d.phase = "reaction";
      return d;
    }

    case "ALLOW": {
      if (state.phase !== "reaction" && state.phase !== "block") return state;
      const d = draft(state);
      d.past = pushPast(state);
      if (state.phase === "reaction") {
        resolveAction(d);
      } else {
        say(d, `${name(d, d.pending?.blockerId ?? null)}'s block stands.`, "block");
        advanceTurn(d);
      }
      return d;
    }

    case "PASS": {
      if (state.phase !== "reaction" && state.phase !== "block") return state;
      if (!state.pending) return state;
      const eligible = responders(state).map((p) => p.id);
      if (!eligible.includes(action.playerId)) return state;
      if (state.pending.passed.includes(action.playerId)) return state;

      const d = draft(state);
      d.past = pushPast(state);
      d.pending!.passed = [...d.pending!.passed, action.playerId];
      say(d, `${name(d, action.playerId)} lets it go.`, "turn");

      // once nobody is left to object, the table has spoken
      if (eligible.every((id) => d.pending!.passed.includes(id))) {
        if (state.phase === "reaction") {
          resolveAction(d);
        } else {
          say(d, `${name(d, d.pending?.blockerId ?? null)}'s block stands.`, "block");
          advanceTurn(d);
        }
      }
      return d;
    }

    /**
     * Calling a bluff no longer settles it. The challenged player has to turn
     * the card over themselves, so the table watches them do it rather than
     * being told the result — and a bluffer concedes instead of being outed
     * by the app before they have moved.
     */
    case "CHALLENGE": {
      const pending = state.pending;
      if (!pending) return state;

      let claimantId: string;
      let claim: Character;
      let onProve: RevealThen;
      let onBluff: RevealThen;

      if (state.phase === "reaction") {
        if (!pending.claim) return state;
        // claim holds → action goes ahead; bluff → action dies
        [claimantId, claim, onProve, onBluff] = [pending.actorId, pending.claim, "resolve", "next"];
      } else if (state.phase === "block") {
        if (!pending.blockerId || !pending.blockClaim) return state;
        // block holds → action is stopped; bluff → action goes ahead
        [claimantId, claim, onProve, onBluff] = [
          pending.blockerId,
          pending.blockClaim,
          "next",
          "resolve",
        ];
      } else {
        return state;
      }

      if (action.challengerId === claimantId) return state;

      const d = draft(state);
      d.past = pushPast(state);
      d.showdown = { claimantId, challengerId: action.challengerId, claim, onProve, onBluff };
      d.phase = "showdown";
      say(d, `${name(d, action.challengerId)} challenges ${name(d, claimantId)}.`, "challenge");
      cue(d, "narrator/challenge");
      beat(
        d,
        "challenge",
        `${name(d, action.challengerId)} calls it — ${name(d, claimantId)} must answer.`
      );
      return d;
    }

    /** The challenged player answers: shows the card, or admits the bluff. */
    case "REVEAL": {
      if (state.phase !== "showdown" || !state.showdown) return state;
      const d = draft(state);
      d.past = pushPast(state);
      settleShowdown(d, Boolean(action.concede));
      return d;
    }

    case "BLOCK": {
      if (state.phase !== "reaction" || !state.pending) return state;
      if (!ACTIONS[state.pending.action].blockedBy.includes(action.claim)) return state;
      const d = draft(state);
      d.past = pushPast(state);
      d.pending!.blockerId = action.blockerId;
      d.pending!.blockClaim = action.claim;
      // the question on the table has changed, so earlier passes don't carry over
      d.pending!.passed = [];
      say(
        d,
        `${name(d, action.blockerId)} blocks with the ${CHARACTER_INFO[action.claim].name}.`,
        "block"
      );
      beat(
        d,
        "block",
        `${name(d, action.blockerId)} blocks, claiming the ${CHARACTER_INFO[action.claim].name}.`
      );
      d.phase = "block";
      return d;
    }

    case "LOSE": {
      if (state.phase !== "reveal" || !state.reveal) return state;
      const d = draft(state);
      d.past = pushPast(state);
      const { playerId, then, landCue } = d.reveal!;
      loseCard(d, playerId, action.cardId, then, landCue);
      return d;
    }

    case "EXCHANGE_KEEP": {
      if (state.phase !== "exchange" || !state.pending) return state;
      const d = draft(state);
      const actor = find(d, d.pending!.actorId);
      if (!actor) return state;
      const live = actor.cards.filter((c) => !c.revealed);
      const pool: InfluenceCard[] = [...live, ...d.exchangeDraw];
      const keep = action.cardIds
        .map((id) => pool.find((c) => c.id === id))
        .filter((c): c is InfluenceCard => Boolean(c));
      // must hand back down to the same number of influences held
      if (keep.length !== live.length) return state;

      d.past = pushPast(state);
      const returned = pool.filter((c) => !action.cardIds.includes(c.id));
      actor.cards = [...keep, ...actor.cards.filter((c) => c.revealed)];
      d.court = shuffle([...d.court, ...returned]);
      d.exchangeDraw = [];
      resolveCue(d);
      say(d, `${actor.name} trades with the court.`, "action");
      advanceTurn(d);
      return d;
    }

    case "UNDO": {
      if (state.past.length === 0) return state;
      const past = [...state.past];
      const previous = past.pop()!;
      return { ...(JSON.parse(previous) as Omit<CoupState, "past">), past } as CoupState;
    }

    case "RESTART": {
      const dealt = reducer(initialState(), {
        type: "START",
        players: state.players.map((p) => ({ id: p.id, name: p.name })),
        // the table rotates: whoever took the last one opens the next
        openerId: state.winnerId ?? undefined,
      });
      // Keep the cue counter climbing across deals. It used to restart at
      // zero, so a client that had been listening all game filtered the new
      // deal's lines out as ones it had already heard — a rematch played in
      // silence until the ids caught up.
      return { ...dealt, cueSeq: state.cueSeq };
    }

    case "NEW_GAME": {
      const fresh = initialState();
      fresh.players = state.players.map((p) => ({ ...p, coins: STARTING_COINS, cards: [] }));
      fresh.cueSeq = state.cueSeq;
      return fresh;
    }

    case "HYDRATE":
      return action.state;

    default:
      return state;
  }
}
