export type Game = {
  /** URL segment, and the folder name under app/, components/ and lib/ */
  slug: string;
  name: string;
  /** What you actually do, in one line, on the hub card */
  tagline: string;
  players: string;
  /** Single glyph shown on the hub emblem */
  emblem: string;
  /** Drives the card's hover tint and emblem weave */
  accent: string;
};

export const GAMES: Game[] = [
  {
    slug: "kings-cup",
    name: "King's Cup",
    tagline: "Draw a card, follow its rule. The app remembers the masters, the mates and the cup.",
    players: "2–12 players · One deck",
    emblem: "♔",
    accent: "#9c2b3b",
  },
  {
    slug: "coup",
    name: "Coup",
    tagline: "Two hidden influences and a lot of lying. Bluff, call bluffs, seize the court.",
    players: "2–6 players · Hidden hands",
    emblem: "⚜",
    accent: "#df4f3b",
  },
  {
    slug: "werewolf",
    name: "One Night Werewolf",
    tagline: "One night, one argument, one vote. Your card may not be yours by morning.",
    players: "3–10 players · Hidden roles",
    emblem: "🌘",
    accent: "#6f7fb8",
  },
];
