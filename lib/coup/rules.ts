import { CHARACTER_INFO } from "./deck";
import type { ActionKind, Character, Pending } from "./types";

/** A player holding this many coins must launch a coup and may do nothing else. */
export const FORCED_COUP_AT = 10;

export interface ActionInfo {
  label: string;
  /** the character the actor is claiming — null means the action needs no claim */
  claim: Character | null;
  cost: number;
  needsTarget: boolean;
  blockedBy: Character[];
  /** foreign aid can be blocked by anyone; assassination and stealing only by the target */
  blockableBy: "any" | "target";
  blurb: string;
}

export const ACTIONS: Record<ActionKind, ActionInfo> = {
  income: {
    label: "Income",
    claim: null,
    cost: 0,
    needsTarget: false,
    blockedBy: [],
    blockableBy: "any",
    blurb: "Take 1 coin. Nobody can touch it.",
  },
  foreign_aid: {
    label: "Foreign Aid",
    claim: null,
    cost: 0,
    needsTarget: false,
    blockedBy: ["duke"],
    blockableBy: "any",
    blurb: "Take 2 coins. Any Duke can block it.",
  },
  coup: {
    label: "Coup",
    claim: null,
    cost: 7,
    needsTarget: true,
    blockedBy: [],
    blockableBy: "any",
    blurb: "Pay 7. They lose an influence, no argument.",
  },
  tax: {
    label: "Tax",
    claim: "duke",
    cost: 0,
    needsTarget: false,
    blockedBy: [],
    blockableBy: "any",
    blurb: "Take 3 coins as the Duke.",
  },
  assassinate: {
    label: "Assassinate",
    claim: "assassin",
    cost: 3,
    needsTarget: true,
    blockedBy: ["contessa"],
    blockableBy: "target",
    blurb: "Pay 3. They lose an influence unless a Contessa stops you.",
  },
  steal: {
    label: "Steal",
    claim: "captain",
    cost: 0,
    needsTarget: true,
    blockedBy: ["captain", "ambassador"],
    blockableBy: "target",
    blurb: "Take 2 coins from a player as the Captain.",
  },
  exchange: {
    label: "Exchange",
    claim: "ambassador",
    cost: 0,
    needsTarget: false,
    blockedBy: [],
    blockableBy: "any",
    blurb: "Draw 2 from the court and keep the hand you like.",
  },
};

export const ACTION_ORDER: ActionKind[] = [
  "income",
  "foreign_aid",
  "tax",
  "steal",
  "exchange",
  "assassinate",
  "coup",
];

/**
 * These helpers run in three places — the server's authoritative state, a
 * shared screen, and a client's redacted view — so they read the smallest
 * shape all three share rather than CoupState itself.
 */
export interface SeatLike {
  id: string;
  name: string;
  coins: number;
  cards: { revealed: boolean }[];
}

export interface TableLike<T extends SeatLike = SeatLike> {
  players: T[];
  turnIndex: number;
  pending: Pending | null;
}

export function isAlive(player: { cards: { revealed: boolean }[] }): boolean {
  return player.cards.some((c) => !c.revealed);
}

export function livePlayers<T extends SeatLike>(state: { players: T[] }): T[] {
  return state.players.filter(isAlive);
}

export function currentPlayer<T extends SeatLike>(state: {
  players: T[];
  turnIndex: number;
}): T | null {
  return state.players[state.turnIndex] ?? null;
}

/** Coup becomes compulsory at 10 coins, so it is the only thing on the menu. */
export function legalActions(state: { players: SeatLike[]; turnIndex: number }): ActionKind[] {
  const actor = currentPlayer(state);
  if (!actor) return [];
  if (actor.coins >= FORCED_COUP_AT) return ["coup"];
  return ACTION_ORDER.filter((kind) => actor.coins >= ACTIONS[kind].cost);
}

/** Everyone still holding an influence, minus the players named. */
export function othersAlive<T extends SeatLike>(
  state: { players: T[] },
  ...exclude: (string | null | undefined)[]
): T[] {
  return livePlayers(state).filter((p) => !exclude.includes(p.id));
}

/** Who is entitled to block the pending action. */
export function eligibleBlockers<T extends SeatLike>(state: TableLike<T>): T[] {
  const pending = state.pending;
  if (!pending) return [];
  const info = ACTIONS[pending.action];
  if (info.blockedBy.length === 0) return [];
  if (info.blockableBy === "target") {
    const target = state.players.find((p) => p.id === pending.targetId);
    return target && isAlive(target) ? [target] : [];
  }
  return othersAlive(state, pending.actorId);
}

/**
 * Everyone who still gets a say on what is on the table. On one device the
 * table speaks with one voice (ALLOW); on separate devices each of these
 * players answers for themselves, and the action resolves once they all pass.
 */
export function responders<T extends SeatLike>(
  state: TableLike<T> & { phase: string }
): T[] {
  if (!state.pending) return [];
  if (state.phase === "reaction") return othersAlive(state, state.pending.actorId);
  if (state.phase === "block") return othersAlive(state, state.pending.blockerId);
  return [];
}

/** The table's line for what the actor just declared. */
export function claimText(
  actorName: string,
  action: ActionKind,
  targetName?: string | null
): string {
  const info = ACTIONS[action];
  const at = targetName ? ` on ${targetName}` : "";
  if (!info.claim) return `${actorName} takes ${info.label}${at}.`;
  return `${actorName} claims the ${CHARACTER_INFO[info.claim].name} — ${info.label}${at}.`;
}
