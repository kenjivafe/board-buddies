import { buildDeck } from "./deck";
import type { GameState, KingMode, Player } from "./types";

export const STORAGE_KEY = "kings-cup-v1";
const UNDO_LIMIT = 30;

export type Action =
  | { type: "START"; players: Player[]; kingMode: KingMode }
  | { type: "DRAW" }
  | { type: "PICK_PLAYER"; targetId: string } // resolves 2 (target) or 8 (mate)
  | { type: "SET_KING_RULE"; text: string }
  | { type: "USE_ACE"; playerId: string }
  | { type: "UNDO" }
  | { type: "RESTART" } // same players, fresh deck
  | { type: "NEW_GAME" } // back to setup
  | { type: "HYDRATE"; state: GameState };

export function initialState(): GameState {
  return {
    phase: "setup",
    players: [],
    kingMode: "cup",
    deck: [],
    drawn: [],
    turnIndex: 0,
    current: null,
    pending: null,
    thumbMasterId: null,
    questionMasterId: null,
    aceTokens: {},
    mates: {},
    kingsDrawn: 0,
    kingRule: null,
    drinkTally: {},
    past: [],
  };
}

function snapshot(state: GameState): string {
  const { past, ...rest } = state;
  return JSON.stringify(rest);
}

function pushPast(state: GameState): string[] {
  const past = [...state.past, snapshot(state)];
  return past.length > UNDO_LIMIT ? past.slice(-UNDO_LIMIT) : past;
}

function addDrink(tally: Record<string, number>, id: string, mates: Record<string, string>): Record<string, number> {
  const next = { ...tally, [id]: (tally[id] ?? 0) + 1 };
  // follow mate chain (guard against cycles)
  const seen = new Set([id]);
  let cur = mates[id];
  while (cur && !seen.has(cur)) {
    next[cur] = (next[cur] ?? 0) + 1;
    seen.add(cur);
    cur = mates[cur];
  }
  return next;
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "START": {
      const fresh = initialState();
      return {
        ...fresh,
        phase: "playing",
        players: action.players,
        kingMode: action.kingMode,
        deck: buildDeck(),
        drinkTally: Object.fromEntries(action.players.map((p) => [p.id, 0])),
      };
    }

    case "DRAW": {
      if (state.phase !== "playing" || state.pending || state.deck.length === 0) return state;
      const past = pushPast(state);
      const deck = [...state.deck];
      const card = deck.pop()!;
      const drawer = state.players[state.turnIndex];

      let next: GameState = {
        ...state,
        past,
        deck,
        current: { card, playerId: drawer.id },
        drawn: [...state.drawn, { card, playerId: drawer.id }],
        turnIndex: (state.turnIndex + 1) % state.players.length,
      };

      const idx = state.players.findIndex((p) => p.id === drawer.id);
      const left = state.players[(idx + 1) % state.players.length];
      const right = state.players[(idx - 1 + state.players.length) % state.players.length];

      switch (card.rank) {
        case 1:
          next.aceTokens = {
            ...next.aceTokens,
            [drawer.id]: (next.aceTokens[drawer.id] ?? 0) + 1,
          };
          break;
        case 2:
          next.pending = "pick-target";
          next.turnIndex = state.turnIndex; // hold turn until resolved
          break;
        case 3:
          next.drinkTally = addDrink(next.drinkTally, drawer.id, next.mates);
          break;
        case 4:
          next.drinkTally = addDrink(next.drinkTally, left.id, next.mates);
          break;
        case 5:
          next.drinkTally = addDrink(next.drinkTally, right.id, next.mates);
          break;
        case 8:
          next.pending = "pick-mate";
          next.turnIndex = state.turnIndex;
          break;
        case 11:
          next.thumbMasterId = drawer.id;
          break;
        case 12:
          next.questionMasterId = drawer.id;
          break;
        case 13: {
          next.kingsDrawn = state.kingsDrawn + 1;
          if (state.kingMode === "rule") {
            next.pending = "king-rule";
            next.turnIndex = state.turnIndex;
          } else if (next.kingsDrawn >= 4) {
            next.drinkTally = addDrink(next.drinkTally, drawer.id, next.mates);
          }
          break;
        }
      }

      if (deck.length === 0 && !next.pending) {
        next.phase = "ended";
      }
      return next;
    }

    case "PICK_PLAYER": {
      if (!state.pending || !state.current) return state;
      const drawerId = state.current.playerId;
      const target = state.players.find((p) => p.id === action.targetId);
      if (!target) return state;

      let next: GameState = {
        ...state,
        pending: null,
        turnIndex: (state.turnIndex + 1) % state.players.length,
      };

      if (state.pending === "pick-target") {
        next.drinkTally = addDrink(next.drinkTally, target.id, next.mates);
        next.current = { ...state.current, note: `${target.name} drinks` };
      } else if (state.pending === "pick-mate") {
        next.mates = { ...next.mates, [drawerId]: target.id };
        next.current = { ...state.current, note: `Mates with ${target.name}` };
      }

      next.drawn = state.drawn.map((d, i) =>
        i === state.drawn.length - 1 ? { ...d, note: next.current?.note } : d
      );
      if (next.deck.length === 0) next.phase = "ended";
      return next;
    }

    case "SET_KING_RULE": {
      if (state.pending !== "king-rule" || !state.current) return state;
      const text = action.text.trim() || "Verbal rule (announced at the table)";
      const note = `Rule: ${text}`;
      const next: GameState = {
        ...state,
        pending: null,
        kingRule: { text, authorId: state.current.playerId },
        current: { ...state.current, note },
        drawn: state.drawn.map((d, i) =>
          i === state.drawn.length - 1 ? { ...d, note } : d
        ),
        turnIndex: (state.turnIndex + 1) % state.players.length,
      };
      if (next.deck.length === 0) next.phase = "ended";
      return next;
    }

    case "USE_ACE": {
      const tokens = state.aceTokens[action.playerId] ?? 0;
      if (tokens <= 0) return state;
      return {
        ...state,
        past: pushPast(state),
        aceTokens: { ...state.aceTokens, [action.playerId]: tokens - 1 },
      };
    }

    case "UNDO": {
      const past = [...state.past];
      const prev = past.pop();
      if (!prev) return state;
      return { ...(JSON.parse(prev) as Omit<GameState, "past">), past };
    }

    case "RESTART": {
      return reducer(state, {
        type: "START",
        players: state.players,
        kingMode: state.kingMode,
      });
    }

    case "NEW_GAME":
      return { ...initialState(), players: state.players, kingMode: state.kingMode };

    default:
      return state;
  }
}
