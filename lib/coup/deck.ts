import type { Character, InfluenceCard } from "./types";

export const CHARACTERS: Character[] = ["duke", "assassin", "captain", "ambassador", "contessa"];

/** Three of each character, fifteen cards in the court. */
export const COPIES_PER_CHARACTER = 3;

export const CHARACTER_INFO: Record<
  Character,
  { name: string; power: string; counter: string; glyph: string }
> = {
  duke: {
    name: "Duke",
    power: "Tax — take 3 coins",
    counter: "Blocks foreign aid",
    glyph: "★",
  },
  assassin: {
    name: "Assassin",
    power: "Assassinate — pay 3, kill an influence",
    counter: "Blocks nothing",
    glyph: "✖",
  },
  captain: {
    name: "Captain",
    power: "Steal — take 2 coins from a player",
    counter: "Blocks stealing",
    glyph: "▼",
  },
  ambassador: {
    name: "Ambassador",
    power: "Exchange — swap cards with the court",
    counter: "Blocks stealing",
    glyph: "◈",
  },
  contessa: {
    name: "Contessa",
    power: "No action",
    counter: "Blocks assassination",
    glyph: "✾",
  },
};

export function buildCourt(): InfluenceCard[] {
  const cards: InfluenceCard[] = [];
  for (const character of CHARACTERS) {
    for (let i = 0; i < COPIES_PER_CHARACTER; i++) {
      cards.push({ id: `${character}-${i}`, character, revealed: false });
    }
  }
  return shuffle(cards);
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
