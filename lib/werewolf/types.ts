export type Role =
  | "werewolf"
  | "minion"
  | "mason"
  | "seer"
  | "robber"
  | "witch"
  | "troublemaker"
  | "drunk"
  | "insomniac"
  | "hunter"
  | "prince"
  | "tanner"
  | "villager";

export type Team = "werewolf" | "village" | "tanner";

export type NightStep =
  | "werewolf"
  | "minion"
  | "mason"
  | "seer"
  | "robber"
  | "witch"
  | "troublemaker"
  | "drunk"
  | "insomniac";

export type Phase =
  | "setup"
  /** pass-and-peek: everyone looks at the card they were dealt */
  | "deal"
  /** walking the wake order, one role at a time */
  | "night"
  /** everybody is awake and arguing */
  | "day"
  /** everyone points at once */
  | "vote"
  | "ended";

export interface OnuwPlayer {
  id: string;
  name: string;
  /**
   * The card this player was dealt. It is NOT necessarily the card they hold
   * at the end — the Robber, the Witch, the Troublemaker and the Drunk all move
   * cards around after the deal. What you *do* at night follows the card you
   * were dealt; what you *win* with follows the card you end up holding.
   */
  dealt: Role;
}

/**
 * One thing a player found out, in their own private notebook. Notes are the
 * only channel by which anything secret reaches a player, which makes the
 * redaction a single filter rather than a field-by-field judgement call.
 */
export interface Note {
  /** the step that produced it, for ordering */
  step: NightStep | "deal" | "dawn";
  text: string;
  /**
   * Cards that were genuinely turned face up for this player.
   *
   * `centre` is 0, 1 or 2 when the card is one of the three in the middle,
   * which lets the screen draw all three and leave the ones nobody looked at
   * face down. Seeing the second of three is a different piece of knowledge
   * from seeing "a card", and the old single thumbnail lost that.
   */
  cards: { role: Role; label: string; centre?: number }[];
}

export type LogKind = "night" | "vote" | "death" | "dawn";

export interface LogEntry {
  text: string;
  kind: LogKind;
}

export interface Outcome {
  /** every ballot, public once the count is read out */
  tally: { id: string; count: number }[];
  /** votes thrown out because they were cast at the Prince */
  princeSaved: string[];
  /** who the village killed */
  killed: string[];
  /** whoever the Hunter took with them */
  hunterShot: string | null;
  /** the players who won, by id */
  winners: string[];
  /** which sides won, for the banner. Empty when everybody lost. */
  teams: Team[];
  /** why it turned out that way, in one line */
  reason: string;
}

export interface OnuwState {
  phase: Phase;
  players: OnuwPlayer[];
  /**
   * Every card in play, by position. Positions 0…players.length-1 belong to the
   * seats in order; the last three are the centre. Cards move between positions
   * during the night, and this is the only record of where they actually are.
   */
  slots: Role[];
  lineup: Record<Role, number>;
  /** how long the argument runs, in seconds. 0 means no clock. */
  discussionSeconds: number;
  /** seat currently peeking during the deal */
  dealIndex: number;
  /**
   * Who has looked at the card they were dealt. Rooms only: on one phone the
   * deal is a queue of one, walked along by whoever is holding it, but on
   * separate devices everybody looks at once and the night cannot start until
   * the last of them has.
   */
  dealSeen: string[];
  step: NightStep | null;
  /** steps already answered, so the walk never doubles back */
  done: NightStep[];
  /** players who have acknowledged the step currently on the table */
  acked: string[];
  /**
   * The centre card the Witch is currently holding up. Looking commits her —
   * once she has seen one she must plant it on somebody — so the look and the
   * placing are two separate decisions with the card revealed in between.
   */
  witchSaw: number | null;
  /** private findings, per player. Never sent to anybody else. */
  notes: Record<string, Note[]>;
  /** voterId → who they pointed at */
  votes: Record<string, string>;
  /** wall-clock end of the argument, for the countdown. Display only. */
  dayEndsAt: number | null;
  outcome: Outcome | null;
  log: LogEntry[];
  /** snapshots for undo */
  past: string[];
}
