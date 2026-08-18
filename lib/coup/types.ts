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
  /** a challenge is on the table; the challenged player must turn a card over */
  | "showdown"
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
  /**
   * Set once a challenge has proved the actor's claim, which turns that card
   * face up. From then on the character speaks for the action itself, so the
   * narrator's resolution line is suppressed.
   */
  claimProven: boolean;
}

/** What happens once the surrendered influence is chosen. */
export type RevealThen = "next" | "resolve";

/**
 * A challenge waiting on the challenged player to answer it.
 *
 * Deliberately carries no hint of whether they actually hold the card. That is
 * theirs to reveal, and their own device works it out from their own hand — so
 * nothing here spoils the outcome for anyone watching.
 */
export interface Showdown {
  claimantId: string;
  challengerId: string;
  claim: Character;
  /** what becomes of the original action once this settles */
  onProve: RevealThen;
  onBluff: RevealThen;
}

export interface RevealRequest {
  playerId: string;
  reason: string;
  then: RevealThen;
}

/**
 * A step in the story of the action currently on the table: who blocked, who
 * called it, whether the claim held, and which influence was handed over.
 *
 * `character` is set ONLY where a card was genuinely turned face up — a proven
 * claim or a surrendered influence. A claim on its own never shows art, since
 * showing the card for something nobody has proved would read as evidence.
 */
export interface Beat {
  kind: "block" | "challenge" | "proven" | "bluff" | "concede" | "surrender" | "out";
  text: string;
  character: Character | null;
  /** the player it happened to, where that makes sense */
  who: string | null;
  /** where that card went: back into the court, or face up out of the game */
  fate: "returned" | "spent" | null;
}

/**
 * A voice line to play, named by its folder and stem under /audio — the client
 * picks a variant. Ids are monotonic so a client can play each cue exactly
 * once, however many times the state is pushed to it.
 *
 * Cues are emitted only for things already public. A character is never named
 * by a cue until that influence has actually been turned face up, so the audio
 * cannot betray a hand the way a claim-based cue would.
 */
export interface AudioCue {
  id: number;
  /** e.g. "narrator/action_tax" or "duke/challenge_reveal" */
  path: string;
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
  /** a challenge awaiting the challenged player's reveal */
  showdown: Showdown | null;
  /** the two cards drawn for an exchange, in hand until the player keeps */
  exchangeDraw: InfluenceCard[];
  /** seat currently peeking during the deal */
  dealIndex: number;
  log: LogEntry[];
  /** the story of the action on the table, cleared when the next one starts */
  beats: Beat[];
  /** voice lines raised by the last step, oldest first */
  cues: AudioCue[];
  /** monotonic, so clients can tell a new cue from a redelivered one */
  cueSeq: number;
  winnerId: string | null;
  /** snapshots for undo */
  past: string[];
}
