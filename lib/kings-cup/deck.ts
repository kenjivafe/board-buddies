import type { Card, Suit } from "./types";

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export const SUIT_GLYPH: Record<Suit, string> = {
  spades: "\u2660",
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
};

export const SUIT_COLOR: Record<Suit, "red" | "black"> = {
  spades: "black",
  clubs: "black",
  hearts: "red",
  diamonds: "red",
};

export function rankLabel(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

export function cardName(card: Card): string {
  const suit = card.suit.charAt(0).toUpperCase() + card.suit.slice(1);
  const names: Record<number, string> = {
    1: "Ace",
    11: "Jack",
    12: "Queen",
    13: "King",
  };
  const rank = names[card.rank] ?? String(card.rank);
  return `${rank} of ${suit}`;
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ rank, suit });
    }
  }
  return shuffle(deck);
}

/** Fisher-Yates */
export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
