import type {
  AudioCue,
  Beat,
  Character,
  CoupState,
  InfluenceCard,
  LogEntry,
  Pending,
  Phase,
  RevealRequest,
  Showdown,
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
  /** who was challenged and on what — but never whether they hold it */
  showdown: Showdown | null;
  /** only ever populated for the player doing the exchanging */
  exchangeDraw: CardView[];
  dealIndex: number;
  log: LogEntry[];
  /** every card named here was genuinely turned face up, so it is public */
  beats: Beat[];
  /** voice lines, naming only influences already turned face up */
  cues: AudioCue[];
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
  /*
   * The game is over, so everything comes face up.
   *
   * There is nothing left to protect — no turn to take and no bluff to run —
   * and the reveal is the whole payoff of a game spent lying about what you
   * were holding. Without this the winner's last influence stayed hidden from
   * everybody but the winner, so the losers, who are exactly the people the
   * reveal is for, got an end screen with the winning hand missing from it.
   */
  const over = state.phase === "ended";

  return {
    phase: state.phase,
    turnIndex: state.turnIndex,
    pending: state.pending,
    reveal: state.reveal,
    showdown: state.showdown,
    dealIndex: state.dealIndex,
    log: state.log,
    beats: state.beats,
    cues: state.cues,
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
        // spent cards are public; an unspent one is its owner's alone until
        // the game ends, when the whole table is entitled to it
        character:
          card.revealed || over || omniscient || p.id === self ? card.character : null,
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
