export type Character = "duke" | "assassin" | "captain" | "ambassador" | "contessa";

export interface InfluenceCard {
  id: string;
  character: Character;
  /** face up = spent. Revealed cards are public and dead. */
  revealed: boolean;
}

export interface CoupPlayer {
  id: string;
  name: string;
  coins: number;
  cards: InfluenceCard[];
}

export type ActionKind =
  | "income"
  | "foreign_aid"
  | "coup"
  | "tax"
  | "assassinate"
  | "steal"
  | "exchange";

export type Phase =
  | "setup"
  /** pass-and-peek: each player looks at their opening hand */
  | "deal"
  /** the player in seat `turnIndex` picks an action */
  | "turn"
  /** the table may challenge the claim or block the action */
  | "reaction"
  /** the table may challenge the blocker's claim */
  | "block"
  /** someone must surrender an influence and choose which */
  | "reveal"
  /** ambassador is picking which cards to keep */
  | "exchange"
  | "ended";

export interface Pending {
  actorId: string;
  action: ActionKind;
  targetId: string | null;
  /** the character the actor is claiming, null for income/aid/coup */
  claim: Character | null;
  blockerId: string | null;
  blockClaim: Character | null;
  /**
   * Player ids who have declined to object. Unused on one device, where a
   * single ALLOW speaks for the whole table; on separate devices the action
   * resolves once every responder appears here.
   */
  passed: string[];
}

/** What happens once the surrendered influence is chosen. */
export type RevealThen = "next" | "resolve";

export interface RevealRequest {
  playerId: string;
  reason: string;
  then: RevealThen;
}

export type LogKind = "turn" | "action" | "challenge" | "block" | "loss" | "out";

export interface LogEntry {
  text: string;
  kind: LogKind;
}

export interface CoupState {
  phase: Phase;
  players: CoupPlayer[];
  /** the court deck */
  court: InfluenceCard[];
  turnIndex: number;
  pending: Pending | null;
  reveal: RevealRequest | null;
  /** the two cards drawn for an exchange, in hand until the player keeps */
  exchangeDraw: InfluenceCard[];
  /** seat currently peeking during the deal */
  dealIndex: number;
  log: LogEntry[];
  winnerId: string | null;
  /** snapshots for undo */
  past: string[];
}
