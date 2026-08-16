export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export interface Card {
  rank: number; // 1 (Ace) .. 13 (King)
  suit: Suit;
}

export interface Player {
  id: string;
  name: string;
}

export type KingMode = "cup" | "rule";

export interface DrawnEntry {
  card: Card;
  playerId: string;
  /** resolved note, e.g. "Miko drinks" or the king rule text */
  note?: string;
}

export type Phase = "setup" | "playing" | "ended";

export interface GameState {
  phase: Phase;
  players: Player[];
  kingMode: KingMode;
  deck: Card[];
  drawn: DrawnEntry[];
  /** index of the player whose turn it is to draw NEXT */
  turnIndex: number;
  /** the currently revealed card (last drawn), if any */
  current: DrawnEntry | null;
  /** pending interaction required before play continues */
  pending: "pick-target" | "pick-mate" | "king-rule" | null;
  thumbMasterId: string | null;
  questionMasterId: string | null;
  /** trump card tokens per player id */
  aceTokens: Record<string, number>;
  /** mate links: when key drinks, value drinks too */
  mates: Record<string, string>;
  kingsDrawn: number;
  kingRule: { text: string; authorId: string } | null;
  /** per-player tally of explicitly assigned drinks */
  drinkTally: Record<string, number>;
  /** snapshots for undo */
  past: string[];
}
