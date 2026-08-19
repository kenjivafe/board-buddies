import type { NightStep, Role, Team } from "./types";

export interface RoleInfo {
  name: string;
  team: Team;
  /** the one line printed under the card */
  blurb: string;
  /** what you do when you're woken, or null if you sleep through */
  night: string | null;
  /** the art in public/werewolf, which prints its own name */
  art: string;
  /** how many of this card the box holds */
  copies: number;
}

/**
 * Setup order, which is also the order the roster prints in: the pack, then
 * everyone who does something about it, then the ones who just have a vote.
 */
export const ROLES: Role[] = [
  "werewolf",
  "minion",
  "mason",
  "seer",
  "robber",
  "witch",
  "troublemaker",
  "drunk",
  "insomniac",
  "hunter",
  "prince",
  "tanner",
  "villager",
];

export const ROLE_INFO: Record<Role, RoleInfo> = {
  werewolf: {
    name: "Werewolf",
    team: "werewolf",
    blurb: "You wake and see the rest of the pack. If you're alone, you may peek at one centre card.",
    night: "See the other werewolves",
    art: "werewolf.png",
    copies: 2,
  },
  minion: {
    name: "Minion",
    team: "werewolf",
    blurb: "You see the pack. They never see you. You win when they win, even if you hang for it.",
    night: "See the werewolves",
    art: "minion.png",
    copies: 1,
  },
  mason: {
    name: "Mason",
    team: "village",
    blurb: "You wake with the other Mason. Seeing nobody means the other card is in the centre.",
    night: "See the other Mason",
    art: "mason.png",
    copies: 2,
  },
  seer: {
    name: "Seer",
    team: "village",
    blurb: "One player's card, or two of the three in the centre. Never both.",
    night: "Look at one player, or two centre cards",
    art: "seer.png",
    copies: 1,
  },
  robber: {
    name: "Robber",
    team: "village",
    blurb: "Take somebody's card and leave them yours. You become what you took — and you get to look.",
    night: "Swap with a player, then look",
    art: "robber.png",
    copies: 1,
  },
  witch: {
    name: "Witch",
    team: "village",
    blurb: "Look at a centre card and you must plant it on somebody — anybody, yourself included.",
    night: "Look at a centre card, then place it",
    art: "witch.png",
    copies: 1,
  },
  troublemaker: {
    name: "Troublemaker",
    team: "village",
    blurb: "Swap two other people's cards. You don't get to look at either of them.",
    night: "Swap two other players",
    art: "troublemaker.png",
    copies: 1,
  },
  drunk: {
    name: "Drunk",
    team: "village",
    blurb: "You must trade your card for one from the centre, and you don't get to see it.",
    night: "Swap with a centre card, blind",
    art: "drunk.png",
    copies: 1,
  },
  insomniac: {
    name: "Insomniac",
    team: "village",
    blurb: "You wake last and check your own card, to find out what the night did to you.",
    night: "Look at your own card",
    art: "insomniac.png",
    copies: 1,
  },
  hunter: {
    name: "Hunter",
    team: "village",
    blurb: "If you die, whoever you pointed at dies with you. Point carefully.",
    night: null,
    art: "hunter.png",
    copies: 1,
  },
  prince: {
    name: "Prince",
    team: "village",
    blurb: "Votes against you don't count. The village will have to hang somebody else.",
    night: null,
    art: "prince.png",
    copies: 1,
  },
  tanner: {
    name: "Tanner",
    team: "tanner",
    blurb: "You hate this town. You win by dying, and only by dying.",
    night: null,
    art: "tanner.png",
    copies: 1,
  },
  villager: {
    name: "Villager",
    team: "village",
    blurb: "No power whatsoever. Only your read on everybody else.",
    night: null,
    art: "villager.png",
    copies: 3,
  },
};

/**
 * The order roles are woken in, from the rulebook. Two placements carry the
 * whole game: the Robber and the Witch move cards before the Troublemaker and
 * the Drunk move them again, and the Insomniac goes last so she sees the
 * result of all of it.
 */
export const NIGHT_ORDER: NightStep[] = [
  "werewolf",
  "minion",
  "mason",
  "seer",
  "robber",
  "witch",
  "troublemaker",
  "drunk",
  "insomniac",
];

/**
 * Steps where nothing is chosen and somebody is simply shown something. On one
 * phone these need a gate to be read behind; on separate devices the same fact
 * sits on its owner's screen, so all they need is an acknowledgement.
 */
export const TELLING_STEPS: NightStep[] = ["minion", "mason"];

/** Three cards are always dealt to the middle of the table. */
export const CENTRE = 3;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;

export const teamOf = (role: Role): Team => ROLE_INFO[role].team;

export const total = (lineup: Record<Role, number>): number =>
  ROLES.reduce((sum, role) => sum + (lineup[role] ?? 0), 0);

/**
 * The order cards get added to a suggested box. Long enough to fill the biggest
 * legal table, and deliberately without the Masons, who only go in as a pair.
 */
const WISHLIST: Role[] = [
  "werewolf",
  "seer",
  "robber",
  "troublemaker",
  "villager",
  "insomniac",
  "werewolf",
  "tanner",
  "villager",
  "drunk",
  "minion",
  "villager",
  "witch",
  "hunter",
  "prince",
];

/** A box that fits `count` players: the classic spine, padded out in order. */
export function suggestLineup(count: number): Record<Role, number> {
  const lineup = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  if (count < MIN_PLAYERS) return lineup;

  const wanted = count + CENTRE;
  for (const role of WISHLIST) {
    if (total(lineup) >= wanted) break;
    if (lineup[role] < ROLE_INFO[role].copies) lineup[role]++;
  }
  return lineup;
}

/**
 * Why a lineup can't be dealt, or null if it can. The count is the strict one:
 * One Night always deals three cards to the centre, so the box has to hold
 * exactly three more cards than there are people.
 */
export function lineupProblem(
  lineup: Record<Role, number>,
  players: number
): string | null {
  if (players < MIN_PLAYERS) return `One Night needs at least ${MIN_PLAYERS} players.`;
  if (players > MAX_PLAYERS) return `One Night tops out at ${MAX_PLAYERS} players.`;

  for (const role of ROLES) {
    if ((lineup[role] ?? 0) > ROLE_INFO[role].copies) {
      return `The box only holds ${ROLE_INFO[role].copies} ${ROLE_INFO[role].name} card${
        ROLE_INFO[role].copies === 1 ? "" : "s"
      }.`;
    }
    if ((lineup[role] ?? 0) < 0) return "That isn't a number of cards.";
  }

  // one Mason with nobody to recognise is just a Villager who feels lonely
  if (lineup.mason === 1) return "The Masons only go in as a pair. Use two, or none.";

  const wanted = players + CENTRE;
  const dealt = total(lineup);
  if (dealt !== wanted) {
    return dealt > wanted
      ? `${dealt} cards for ${players} players — you need exactly ${wanted}. Drop ${dealt - wanted}.`
      : `${dealt} cards for ${players} players — you need exactly ${wanted}. Add ${wanted - dealt}.`;
  }
  return null;
}
