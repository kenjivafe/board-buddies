import type {
  Beat,
  Character,
  CoupState,
  InfluenceCard,
  LogEntry,
  Pending,
  Phase,
  RevealRequest,
} from "./types";

export interface CardView {
  id: string;
  revealed: boolean;
  /** null when this viewer has no business knowing */
  character: Character | null;
}

export interface PlayerView {
  id: string;
  name: string;
  coins: number;
  cards: CardView[];
}

/**
 * What one client is allowed to know. Deliberately NOT a CoupState: the court's
 * order and the undo snapshots both contain every hidden card in the game, so
 * neither is ever built into a view.
 */
export interface CoupView {
  phase: Phase;
  players: PlayerView[];
  turnIndex: number;
  pending: Pending | null;
  reveal: RevealRequest | null;
  /** only ever populated for the player doing the exchanging */
  exchangeDraw: CardView[];
  dealIndex: number;
  log: LogEntry[];
  /** every card named here was genuinely turned face up, so it is public */
  beats: Beat[];
  winnerId: string | null;
  courtCount: number;
  /** who is holding the device; null on a shared screen */
  selfId: string | null;
  /** one-device play, where the holder legitimately has every card */
  omniscient: boolean;
}

/** Viewer id meaning "this device holds the whole game" — pass-and-peek mode. */
export const ALL_SEEING = "*";

const toCardView = (card: InfluenceCard): CardView => ({
  id: card.id,
  revealed: card.revealed,
  character: card.character,
});

export function viewFor(state: CoupState, viewerId: string | null): CoupView {
  const omniscient = viewerId === ALL_SEEING;
  const self = omniscient ? null : viewerId;
  const isActor = Boolean(state.pending && self && state.pending.actorId === self);

  return {
    phase: state.phase,
    turnIndex: state.turnIndex,
    pending: state.pending,
    reveal: state.reveal,
    dealIndex: state.dealIndex,
    log: state.log,
    beats: state.beats,
    winnerId: state.winnerId,
    courtCount: state.court.length,
    selfId: self,
    omniscient,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      cards: p.cards.map((card) => ({
        id: card.id,
        revealed: card.revealed,
        // spent cards are public; an unspent one is its owner's alone
        character:
          card.revealed || omniscient || p.id === self ? card.character : null,
      })),
    })),
    exchangeDraw: omniscient || isActor ? state.exchangeDraw.map(toCardView) : [],
  };
}

export interface KnownCard {
  id: string;
  revealed: boolean;
  character: Character;
}

/** Narrows to the cards this viewer can actually name. */
export function known(cards: CardView[]): KnownCard[] {
  return cards.filter((c): c is KnownCard => c.character !== null);
}
