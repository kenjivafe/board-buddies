import { CENTRE, ROLE_INFO } from "./roles";
import type {
  LogEntry,
  NightStep,
  Note,
  OnuwPlayer,
  OnuwState,
  Outcome,
  Role,
} from "./types";

/** Viewer id meaning "this device holds the whole game" — pass-and-peek mode. */
export const ALL_SEEING = "*";

export interface PlayerView {
  id: string;
  name: string;
  /** the card they were dealt. Yours all game; everyone's once it is over. */
  dealt: Role | null;
  /**
   * The card they were holding at the end. Null until the game is over — while
   * play is running this is the single most valuable secret on the table, and
   * half the roles exist to move it around behind people's backs.
   */
  final: Role | null;
}

export interface SelfView {
  id: string;
  /** what you were dealt — never what you are now, unless something told you */
  dealt: Role;
  /** your own notebook, and nobody else's */
  notes: Note[];
  /** true when this step is one that wakes you */
  awake: boolean;
  /** true once you've said you've read it */
  acked: boolean;
}

/**
 * What one client is allowed to know. Deliberately NOT an OnuwState: `slots`
 * is where every card actually is, `notes` is everybody's private findings and
 * `past` holds snapshots of both, so none of the three is ever built into a
 * view whole.
 */
export interface OnuwView {
  phase: OnuwState["phase"];
  players: PlayerView[];
  /** the box is public — knowing what could be out there is the whole game */
  lineup: Record<Role, number>;
  discussionSeconds: number;
  dealIndex: number;
  /**
   * The step, but only for the people it wakes. Everyone else gets null and a
   * dark screen: publishing the running order would announce which roles were
   * actually dealt to players and which are sitting in the centre.
   */
  step: NightStep | null;
  /** who in your own group has already looked. Empty unless you're in it. */
  acked: string[];
  /**
   * How many people this step wakes — told only to the people it wakes, who
   * were shown each other anyway. It is how a werewolf knows they are alone,
   * and being alone is the one thing that earns a look at the middle.
   */
  groupSize: number;
  /** how many of them have yet to answer, without saying who */
  waitingOn: number;
  /** the centre card the Witch is holding up, hers alone to see */
  witchSaw: number | null;
  /**
   * The three in the middle. All null until the game is over — for *everybody*,
   * including the one-phone device. Nothing in the game ever needs to draw a
   * face-up centre card before the end: the roles that get to look at one are
   * told what they saw through their own notebook, after they have chosen it.
   */
  centre: (Role | null)[];
  /** who has pointed. Never who they pointed at. */
  votedIds: string[];
  /** your own vote, if you've cast it */
  myVote: string | undefined;
  /** every ballot, once the count is read out */
  ballots: { voterId: string; targetId: string }[] | null;
  dayEndsAt: number | null;
  outcome: Outcome | null;
  log: LogEntry[];
  selfId: string | null;
  /** one-device play, where the holder legitimately holds the whole game */
  omniscient: boolean;
  /** filled only on the device that holds everything, for the gates to ration */
  table: { notes: Record<string, Note[]> } | null;
  self: SelfView | null;
}

/** Which players a given step wakes — everything is named after its own role. */
const actorsOf = (state: OnuwState, step: NightStep): OnuwPlayer[] =>
  state.players.filter((p) => p.dealt === step);

export function viewFor(state: OnuwState, viewerId: string | null): OnuwView {
  const omniscient = viewerId === ALL_SEEING;
  const selfId = omniscient ? null : viewerId;
  const viewer = selfId ? state.players.find((p) => p.id === selfId) ?? null : null;
  const over = state.phase === "ended";

  const actors = state.step ? actorsOf(state, state.step) : [];
  const awake = Boolean(viewer && actors.some((a) => a.id === viewer.id));
  const centreStart = state.players.length;

  return {
    phase: state.phase,
    lineup: state.lineup,
    discussionSeconds: state.discussionSeconds,
    dealIndex: state.dealIndex,
    dayEndsAt: state.dayEndsAt,
    outcome: state.outcome,
    log: state.log,
    selfId,
    omniscient,

    step: omniscient || awake ? state.step : null,
    // your own group's progress is yours to see; the pack already knows the pack
    acked: omniscient || awake ? state.acked : [],
    groupSize: omniscient || awake ? actors.length : 0,
    waitingOn: Math.max(0, actors.length - state.acked.length),
    witchSaw: omniscient || (awake && state.step === "witch") ? state.witchSaw : null,

    centre: Array.from({ length: CENTRE }, (_, i) =>
      over ? state.slots[centreStart + i] ?? null : null
    ),

    votedIds: Object.keys(state.votes),
    myVote: viewer ? state.votes[viewer.id] : undefined,
    ballots: over
      ? Object.entries(state.votes).map(([voterId, targetId]) => ({ voterId, targetId }))
      : null,

    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      // one phone has to know who was dealt what — it is how the gates know
      // whose turn it is, and the deal round shows each card to its owner
      dealt: omniscient || over || p.id === selfId ? p.dealt : null,
      // where the cards ended up, though, is nobody's business until the end
      final: over ? state.slots[i] ?? null : null,
    })),

    // `slots` is deliberately not here. The one-phone device needs everybody's
    // notebooks, because it shows each of them behind a gate — but it never
    // needs the map of where the cards actually are, so it isn't given one.
    table: omniscient ? { notes: state.notes } : null,

    self: viewer
      ? {
          id: viewer.id,
          dealt: viewer.dealt,
          notes: state.notes[viewer.id] ?? [],
          awake,
          acked: state.acked.includes(viewer.id),
        }
      : null,
  };
}

// ---------- helpers the UI leans on ----------

export const playerIn = (view: OnuwView, id: string | null): PlayerView | null =>
  view.players.find((p) => p.id === id) ?? null;

/** The slot indices of the three centre cards, which sit after every seat. */
export const centreSlotsIn = (view: OnuwView): number[] =>
  Array.from({ length: CENTRE }, (_, i) => view.players.length + i);

export const centreLabel = (view: OnuwView, slot: number): string =>
  ["The first", "The second", "The third"][slot - view.players.length] ?? "A";

/** The notebook to render: your own, or on one phone whoever is holding it. */
export function notesFor(view: OnuwView, playerId: string | null): Note[] {
  if (view.table && playerId) return view.table.notes[playerId] ?? [];
  return view.self?.notes ?? [];
}

/** Who a step wakes, for the one device that is allowed to know. */
export function wakers(view: OnuwView, step: NightStep | null): PlayerView[] {
  if (!step) return [];
  return view.players.filter((p) => p.dealt === step);
}

export const teamOfRole = (role: Role) => ROLE_INFO[role].team;
