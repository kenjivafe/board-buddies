import {
  initialState as coupInitial,
  reducer as coupReducer,
  type Action as CoupAction,
} from "@/lib/coup/reducer";
import { responders } from "@/lib/coup/rules";
import { ALL_SEEING, viewFor as coupViewFor } from "@/lib/coup/view";
import type { CoupState } from "@/lib/coup/types";
import {
  initialState as kcInitial,
  reducer as kcReducer,
  type Action as KcAction,
} from "@/lib/kings-cup/reducer";
import type { GameState as KcState, KingMode } from "@/lib/kings-cup/types";
import {
  actorsOf as wwActors,
  initialState as wwInitial,
  reducer as wwReducer,
  type Action as WwAction,
} from "@/lib/werewolf/reducer";
import { MAX_PLAYERS, MIN_PLAYERS, lineupProblem } from "@/lib/werewolf/roles";
import { viewFor as wwViewFor } from "@/lib/werewolf/view";
import type { NightStep, OnuwState, Role as WwRole } from "@/lib/werewolf/types";
import { RoomError, type GameId, type Seat } from "./types";

export interface StartOptions {
  /** King's Cup only */
  kingMode?: KingMode;
  /** Werewolf only */
  lineup?: Record<WwRole, number>;
  discussionSeconds?: number;
}

interface Adapter {
  minSeats: number;
  maxSeats: number;
  start(seats: Seat[], options: StartOptions): unknown;
  /**
   * Apply one client action. Throws unless this player is entitled to it —
   * the client is never trusted to police whose turn it is.
   */
  apply(state: unknown, action: unknown, actorId: string, isHost: boolean): unknown;
  view(state: unknown, viewerId: string | null): unknown;
  /** true once the game is over */
  finished(state: unknown): boolean;
  /** true when the game has fallen back to its own setup screen */
  atSetup(state: unknown): boolean;
}

function deny(message: string): never {
  throw new RoomError("forbidden", message, 403);
}

// ---------- Coup ----------

/**
 * Every device shows its owner their own hand, so the pass-and-peek deal round
 * has nothing to do in a room. Applied to everything this adapter hands back,
 * not just the opening state: RESTART deals again through START and lands here
 * too, and a room stuck in `deal` renders no panel and has no legal action to
 * escape with, because DEAL_NEXT is exactly what rooms refuse.
 */
function skipDeal(state: CoupState): CoupState {
  let next = state;
  while (next.phase === "deal") next = coupReducer(next, { type: "DEAL_NEXT" });
  return next;
}

const coup: Adapter = {
  minSeats: 2,
  maxSeats: 6,

  start(seats) {
    return skipDeal(
      coupReducer(coupInitial(), {
        type: "START",
        players: seats.map((s) => ({ id: s.id, name: s.name })),
      })
    );
  },

  apply(raw, rawAction, actorId, isHost) {
    const state = raw as CoupState;
    const action = rawAction as CoupAction;
    const turnId = state.players[state.turnIndex]?.id;

    switch (action.type) {
      case "ACT":
        if (actorId !== turnId) deny("It is not your turn.");
        break;

      case "PASS":
        // the reducer checks eligibility too; this keeps one device from
        // passing on someone else's behalf
        if (action.playerId !== actorId) deny("You can only pass for yourself.");
        break;

      case "CHALLENGE":
        if (action.challengerId !== actorId) deny("You can only challenge for yourself.");
        if (!responders(state).some((p) => p.id === actorId)) deny("You have no say here.");
        break;

      case "BLOCK":
        if (action.blockerId !== actorId) deny("You can only block for yourself.");
        break;

      case "REVEAL":
        if (state.showdown?.claimantId !== actorId) {
          deny("That challenge is not yours to answer.");
        }
        break;

      case "LOSE":
        if (state.reveal?.playerId !== actorId) deny("That is not your influence to give up.");
        break;

      case "EXCHANGE_KEEP":
        if (state.pending?.actorId !== actorId) deny("That is not your exchange.");
        break;

      case "DEAL_NEXT":
        // rooms deal to every device at once, so nobody walks the deal along
        deny("Not available in a room.");
        break;

      case "ALLOW":
        // one device speaking for the table has no meaning here — use PASS
        deny("Everyone answers for themselves in a room.");
        break;

      case "RESTART":
      case "NEW_GAME":
        if (!isHost) deny("Only the host can restart.");
        break;

      case "UNDO":
        // undo would rewind cards people have already seen
        deny("Undo is only available on a single device.");
        break;

      default:
        throw new RoomError("bad-action", "Unknown action.", 400);
    }

    return skipDeal(coupReducer(state, action));
  },

  view(state, viewerId) {
    return coupViewFor(state as CoupState, viewerId);
  },

  finished(state) {
    return (state as CoupState).phase === "ended";
  },

  atSetup(state) {
    return (state as CoupState).phase === "setup";
  },
};

// ---------- King's Cup ----------

const kingsCup: Adapter = {
  minSeats: 2,
  maxSeats: 12,

  start(seats, options) {
    return kcReducer(kcInitial(), {
      type: "START",
      players: seats.map((s) => ({ id: s.id, name: s.name })),
      kingMode: options.kingMode ?? "cup",
    });
  },

  apply(raw, rawAction, actorId, isHost) {
    const state = raw as KcState;
    const action = rawAction as KcAction;
    const turnId = state.players[state.turnIndex]?.id;
    // once a card is face up, the person who drew it resolves it
    const resolverId = state.current?.playerId ?? turnId;

    switch (action.type) {
      case "DRAW":
        if (actorId !== turnId) deny("It is not your turn to draw.");
        break;

      case "PICK_PLAYER":
      case "SET_KING_RULE":
        if (actorId !== resolverId) deny("Only the player who drew resolves the card.");
        break;

      case "USE_ACE":
        // spending your own trump token, and only your own
        if (action.playerId !== actorId) deny("That trump card is not yours.");
        break;

      case "RESTART":
      case "NEW_GAME":
        if (!isHost) deny("Only the host can restart.");
        break;

      case "UNDO":
        if (!isHost) deny("Only the host can undo.");
        break;

      default:
        throw new RoomError("bad-action", "Unknown action.", 400);
    }

    return kcReducer(state, action);
  },

  view(state) {
    // every card and rule in King's Cup is public; only the undo stack is
    // dropped, and that is bandwidth rather than secrecy
    const { past: _past, ...rest } = state as KcState;
    return rest;
  },

  finished(state) {
    return (state as KcState).phase === "ended";
  },

  atSetup(state) {
    return (state as KcState).phase === "setup";
  },
};

// ---------- Werewolf (One Night) ----------

/*
 * Rooms used to walk the deal through here and start on the night, on the
 * grounds that a card sitting on its owner's own screen needs no handing
 * round. True, and it still skipped the moment the game is actually made of:
 * everybody looking at what they were dealt and working out what it means
 * before the dark. Now the room holds in `deal` until every seat has said
 * they have seen it — SAW_DEAL below — or the host starts without them.
 */

const werewolf: Adapter = {
  minSeats: MIN_PLAYERS,
  maxSeats: MAX_PLAYERS,

  start(seats, options) {
    const lineup = options.lineup;
    if (!lineup) throw new RoomError("bad-action", "Pick a lineup first.", 400);
    // the host names the cards, so the host is exactly who must not be trusted
    // with them — a box of nothing but werewolves is one POST away otherwise
    const problem = lineupProblem(lineup, seats.length);
    if (problem) throw new RoomError("bad-action", problem, 400);

    return wwReducer(wwInitial(), {
      type: "START",
      players: seats.map((s) => ({ id: s.id, name: s.name })),
      lineup,
      discussionSeconds: Math.min(1800, Math.max(0, Math.floor(options.discussionSeconds ?? 300))),
    });
  },

  apply(raw, rawAction, actorId, isHost) {
    const state = raw as OnuwState;
    const action = rawAction as WwAction;

    /** The role that is on the table right now must be one this seat was dealt. */
    const isActor = (step: NightStep) =>
      state.step === step && wwActors(state, step).some((p) => p.id === actorId);

    switch (action.type) {
      case "SAW_DEAL":
        // nobody gets to look at their card on somebody else's behalf, and
        // nobody gets to hurry the table along by answering for them
        if (action.playerId !== actorId) deny("You can only answer for yourself.");
        if (state.phase !== "deal") deny("The cards are already out.");
        break;

      case "BEGIN_NIGHT":
        if (!isHost) deny("The host is running this table.");
        if (state.phase !== "deal") deny("The night has already started.");
        break;

      case "WAKE_ACK":
        if (action.playerId !== actorId) deny("You can only answer for yourself.");
        if (!state.step || !isActor(state.step)) deny("Nothing woke you.");
        break;

      case "SEER":
        if (!isActor("seer")) deny("That reading is not yours to take.");
        break;

      case "ROBBER":
        if (!isActor("robber")) deny("Those are not your hands.");
        break;

      case "WITCH_LOOK":
      case "WITCH_PLACE":
      case "WITCH_PASS":
        if (!isActor("witch")) deny("That is not your business with the middle.");
        break;

      case "TROUBLEMAKER":
        if (!isActor("troublemaker")) deny("That is not your trouble to cause.");
        break;

      case "DRUNK":
        if (!isActor("drunk")) deny("You are not the one who has been drinking.");
        break;

      case "INSOMNIAC":
        if (!isActor("insomniac")) deny("You slept fine.");
        break;

      case "VOTE":
        if (action.voterId !== actorId) deny("You can only point for yourself.");
        break;

      case "TICK":
      case "OPEN_VOTE":
        // one device narrates the night out loud and calls time on the
        // argument, and that device is the host's
        if (!isHost) deny("The host is running this table.");
        break;

      case "RESTART":
      case "NEW_GAME":
        if (!isHost) deny("Only the host can deal again.");
        break;

      case "DEAL_NEXT":
        // rooms deal to every device at once, so there is no queue to advance;
        // SAW_DEAL is how a seat says it is done looking
        deny("Not available in a room.");
        break;

      case "UNDO":
        // undo would rewind cards people have already been shown
        deny("Undo is only available on a single device.");
        break;

      default:
        throw new RoomError("bad-action", "Unknown action.", 400);
    }

    return wwReducer(state, action);
  },

  view(state, viewerId) {
    return wwViewFor(state as OnuwState, viewerId);
  },

  finished(state) {
    return (state as OnuwState).phase === "ended";
  },

  atSetup(state) {
    return (state as OnuwState).phase === "setup";
  },
};

const ADAPTERS: Record<GameId, Adapter> = { coup, "kings-cup": kingsCup, werewolf };

export function adapterFor(game: GameId): Adapter {
  const adapter = ADAPTERS[game];
  if (!adapter) throw new RoomError("bad-action", `Unknown game: ${game}`, 400);
  return adapter;
}

export { ALL_SEEING };
