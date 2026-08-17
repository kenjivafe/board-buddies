import type { Player } from "./types";
import type { KcView } from "./view";

export interface RuleInfo {
  title: string;
  /** short static description used in the rules sheet */
  summary: string;
}

export const RULES: Record<number, RuleInfo> = {
  1: { title: "Trump Card", summary: "Keep it. Skip one drink, once." },
  2: { title: "You", summary: "Pick someone. They drink." },
  3: { title: "Me", summary: "You drink." },
  4: { title: "Left", summary: "Player on your left drinks." },
  5: { title: "Right", summary: "Player on your right drinks." },
  6: { title: "Hell", summary: "Last to touch the table drinks." },
  7: { title: "Heaven", summary: "Last to raise a hand drinks." },
  8: { title: "Mate", summary: "Pick a mate. They drink when you drink." },
  9: { title: "Rhyme", summary: "Say a word. Go around rhyming. First to fail drinks." },
  10: { title: "Categories", summary: "Pick a category. Go around. First to fail drinks." },
  11: { title: "Thumb Master", summary: "Thumb on the table, any time. Last to follow drinks." },
  12: { title: "Question Master", summary: "Answer their question, you drink." },
  13: { title: "King", summary: "Cup or rule, depending on the mode." },
};

function playerName(players: Player[], id: string | null | undefined): string {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}

/** Full instruction text for a freshly drawn card, with names resolved. */
export function instructionFor(state: KcView, drawerId: string): string {
  const card = state.current?.card;
  if (!card) return "";
  const players = state.players;
  const drawer = playerName(players, drawerId);
  const idx = players.findIndex((p) => p.id === drawerId);
  const left = players[(idx + 1) % players.length];
  const right = players[(idx - 1 + players.length) % players.length];

  switch (card.rank) {
    case 1:
      return `${drawer} holds a Trump Card. Use it once to skip a drink.`;
    case 2:
      return `${drawer} picks someone to drink.`;
    case 3:
      return `${drawer} drinks.`;
    case 4:
      return `${left.name} drinks. (Left of ${drawer})`;
    case 5:
      return `${right.name} drinks. (Right of ${drawer})`;
    case 6:
      return "Hell! Last to touch the table drinks.";
    case 7:
      return "Heaven! Last to raise a hand drinks.";
    case 8:
      return `${drawer} picks a mate. When ${drawer} drinks, they drink.`;
    case 9:
      return `${drawer} says a word. Go around rhyming — first to fail drinks.`;
    case 10:
      return `${drawer} picks a category. Go around — first to fail drinks.`;
    case 11:
      return `${drawer} is the Thumb Master. Thumb on the table — last to follow drinks.`;
    case 12:
      return `${drawer} is the Question Master. Answer their question, you drink.`;
    case 13: {
      if (state.kingMode === "rule") {
        return `${drawer} makes a rule. Break it, drink. A new King replaces it.`;
      }
      const n = state.kingsDrawn; // already incremented on draw
      if (n >= 4) return `Fourth King! ${drawer} drinks the King's Cup.`;
      return `King ${n} of 4. ${drawer} pours into the King's Cup.`;
    }
    default:
      return "";
  }
}
