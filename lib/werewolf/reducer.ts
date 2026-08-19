import { CENTRE, NIGHT_ORDER, ROLES, ROLE_INFO, lineupProblem } from "./roles";
import type {
  LogEntry,
  LogKind,
  Note,
  NightStep,
  OnuwPlayer,
  OnuwState,
  Outcome,
  Role,
  Team,
} from "./types";

export const STORAGE_KEY = "werewolf-v1";
const UNDO_LIMIT = 30;

export type Action =
  | {
      type: "START";
      players: { id: string; name: string }[];
      lineup: Record<Role, number>;
      discussionSeconds: number;
    }
  /** one phone: walk the dealt cards round the table */
  | { type: "DEAL_NEXT" }
  /**
   * "I've seen it" for the three steps that only show somebody something.
   * `centreSlot` is honoured for a werewolf who turns out to be alone, who is
   * the only person in that group with a decision to make.
   */
  | { type: "WAKE_ACK"; playerId: string; centreSlot?: number }
  /** one player, or two centre cards, or a Seer who declines to look */
  | { type: "SEER"; targetId: string | null; centreSlots: number[] }
  | { type: "ROBBER"; targetId: string | null }
  /** the Witch turns one centre card over; from here she is committed */
  | { type: "WITCH_LOOK"; centreSlot: number }
  /** …and has to put it on somebody, herself included */
  | { type: "WITCH_PLACE"; targetId: string }
  /** …or she never looked, and nothing moves */
  | { type: "WITCH_PASS" }
  | { type: "TROUBLEMAKER"; aId: string | null; bId: string | null }
  | { type: "DRUNK"; centreSlot: number }
  | { type: "INSOMNIAC" }
  /**
   * "Nothing happened here, move on." Sent by whoever is pacing the night —
   * the phone on one device, the host in a room — once a role has been called
   * and given its beat. It only ever moves a step that nobody was dealt, so
   * the sender never has to know whether that is the case, and therefore never
   * learns which roles are in the middle.
   */
  | { type: "TICK" }
  | { type: "OPEN_VOTE" }
  | { type: "VOTE"; voterId: string; targetId: string }
  | { type: "UNDO" }
  | { type: "RESTART" }
  | { type: "NEW_GAME" }
  | { type: "HYDRATE"; state: OnuwState };

const emptyLineup = (): Record<Role, number> =>
  Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;

export function initialState(): OnuwState {
  return {
    phase: "setup",
    players: [],
    slots: [],
    lineup: emptyLineup(),
    discussionSeconds: 300,
    dealIndex: 0,
    step: null,
    done: [],
    acked: [],
    witchSaw: null,
    notes: {},
    votes: {},
    dayEndsAt: null,
    outcome: null,
    log: [],
    past: [],
  };
}

/** Fisher-Yates */
function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function snapshot(state: OnuwState): string {
  const { past: _past, ...rest } = state;
  return JSON.stringify(rest);
}

function pushPast(state: OnuwState): string[] {
  const past = [...state.past, snapshot(state)];
  return past.length > UNDO_LIMIT ? past.slice(-UNDO_LIMIT) : past;
}

// ---------- reading the table ----------

/** A player's seat, which is also the index of the slot holding their card. */
export const seatOf = (state: OnuwState, playerId: string): number =>
  state.players.findIndex((p) => p.id === playerId);

/** The card somebody is holding *now*, which is not always the one they were dealt. */
export const cardOf = (state: OnuwState, playerId: string): Role | null => {
  const seat = seatOf(state, playerId);
  return seat < 0 ? null : state.slots[seat];
};

/** The three slot indices that make up the centre. */
export const centreSlots = (state: OnuwState): number[] =>
  Array.from({ length: CENTRE }, (_, i) => state.players.length + i);

export const isCentre = (state: OnuwState, slot: number): boolean =>
  slot >= state.players.length && slot < state.players.length + CENTRE;

/** Everybody who was DEALT this role — which is who acts on it, whatever happens later. */
export const dealtWith = (state: OnuwState, role: Role): OnuwPlayer[] =>
  state.players.filter((p) => p.dealt === role);

export const nameOf = (state: OnuwState, id: string | null): string =>
  state.players.find((p) => p.id === id)?.name ?? "someone";

/** "the first", "the second", "the third" — centre cards are named by position. */
export const centreName = (state: OnuwState, slot: number): string =>
  ["the first", "the second", "the third"][slot - state.players.length] ?? "a";

function swapSlots(slots: Role[], a: number, b: number): Role[] {
  const next = [...slots];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function addNote(state: OnuwState, playerId: string, note: Note): OnuwState {
  return {
    ...state,
    notes: { ...state.notes, [playerId]: [...(state.notes[playerId] ?? []), note] },
  };
}

const logged = (state: OnuwState, text: string, kind: LogKind): LogEntry[] => [
  ...state.log,
  { text, kind },
];

const listOf = (names: string[]): string =>
  names.length === 0
    ? "nobody"
    : names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// ---------- walking the night ----------

/**
 * Who this step wakes. Every step is named after the role it calls, so this is
 * simply everybody dealt that card — and a role whose only copies went to the
 * centre wakes nobody, which is exactly right.
 */
export const actorsOf = (state: OnuwState, step: NightStep): OnuwPlayer[] =>
  dealtWith(state, step);

/**
 * The three steps that only show somebody something write their notes the
 * moment the step opens, not when it is acknowledged — the pack has to be able
 * to read who the pack is *before* tapping to say they've read it.
 */
function announce(state: OnuwState, step: NightStep): OnuwState {
  let next = state;
  const actors = actorsOf(state, step);

  if (step === "werewolf") {
    for (const wolf of actors) {
      const others = actors.filter((a) => a.id !== wolf.id);
      next = addNote(next, wolf.id, {
        step,
        text:
          others.length > 0
            ? `The rest of the pack: ${listOf(others.map((o) => o.name))}.`
            : "You are the only werewolf at this table.",
        cards: [],
      });
    }
  }

  if (step === "minion") {
    const wolves = dealtWith(state, "werewolf");
    for (const minion of actors) {
      next = addNote(next, minion.id, {
        step,
        text:
          wolves.length > 0
            ? `The pack: ${listOf(wolves.map((w) => w.name))}. They have no idea who you are.`
            : "Nobody was dealt a werewolf. You are on your own, and you need somebody to hang.",
        cards: [],
      });
    }
  }

  if (step === "mason") {
    for (const mason of actors) {
      const others = actors.filter((a) => a.id !== mason.id);
      next = addNote(next, mason.id, {
        step,
        text:
          others.length > 0
            ? `The other Mason is ${listOf(others.map((o) => o.name))}.`
            : "No other Mason woke up. The second Mason card is in the centre.",
        cards: [],
      });
    }
  }

  return next;
}

/**
 * Whether a role is in the box at all — as opposed to whether anybody was
 * dealt it. Every role in the box gets called, exactly as a moderator calls
 * them: skipping the ones that landed in the middle would announce which
 * roles are in the middle, which is most of what the table is trying to work
 * out. A role nobody holds simply has nobody to answer, and the night waits a
 * beat and moves on.
 */
const inTheBox = (state: OnuwState, step: NightStep) => (state.lineup[step] ?? 0) > 0;

function advance(state: OnuwState): OnuwState {
  const next =
    NIGHT_ORDER.find((s) => !state.done.includes(s) && inTheBox(state, s)) ?? null;
  if (next === null) return dawn(state);
  if (next === state.step) return state;
  return announce({ ...state, step: next, acked: [], witchSaw: null }, next);
}

/** Marks the step on the table answered and moves the night on. */
function finish(state: OnuwState, step: NightStep): OnuwState {
  return advance({ ...state, done: [...state.done, step], acked: [] });
}

function dawn(state: OnuwState): OnuwState {
  return {
    ...state,
    phase: "day",
    step: null,
    acked: [],
    dayEndsAt:
      state.discussionSeconds > 0 ? Date.now() + state.discussionSeconds * 1000 : null,
    log: logged(state, "The sun comes up. Everyone is still here — for now.", "dawn"),
  };
}

// ---------- the vote, and what it settles ----------

/**
 * Who wins, from the cards people are holding at the end rather than the ones
 * they were dealt. Straight out of the rulebook, and the ordering matters: the
 * Tanner is asked first because his death costs the pack their win, and the
 * Minion is asked last because he only ever matters when the pack is absent.
 */
function judge(
  state: OnuwState,
  killed: string[],
  tally: { id: string; count: number }[],
  princeSaved: string[],
  hunterShot: string | null
): Outcome {
  const finalOf = (id: string) => cardOf(state, id)!;
  const teamOfPlayer = (id: string) => ROLE_INFO[finalOf(id)].team;
  const idsWhere = (fn: (id: string) => boolean) =>
    state.players.map((p) => p.id).filter(fn);

  const wolvesInPlay = idsWhere((id) => finalOf(id) === "werewolf");
  const wolfKilled = killed.some((id) => finalOf(id) === "werewolf");
  const tannersKilled = killed.filter((id) => finalOf(id) === "tanner");

  const winners = new Set<string>();
  const teams: Team[] = [];
  let reason: string;

  if (tannersKilled.length > 0) {
    for (const id of tannersKilled) winners.add(id);
    teams.push("tanner");
  }

  if (wolfKilled) {
    for (const id of idsWhere((p) => teamOfPlayer(p) === "village")) winners.add(id);
    teams.push("village");
    reason =
      tannersKilled.length > 0
        ? "A werewolf died — and so did the Tanner, who is delighted."
        : "The village found a werewolf and hanged it.";
  } else if (wolvesInPlay.length > 0) {
    if (tannersKilled.length > 0) {
      reason = "The Tanner got exactly what he wanted, and took the pack's win down with him.";
    } else {
      for (const id of idsWhere((p) => teamOfPlayer(p) === "werewolf")) winners.add(id);
      teams.push("werewolf");
      reason = "Not one werewolf died. The pack eats well.";
    }
  } else if (killed.length === 0) {
    for (const id of idsWhere((p) => teamOfPlayer(p) === "village")) winners.add(id);
    teams.push("village");
    reason = "Every werewolf card was sitting in the centre, and the village killed nobody.";
  } else {
    // no werewolves among the players, and the village hanged somebody anyway
    const minions = idsWhere((id) => finalOf(id) === "minion" && !killed.includes(id));
    if (minions.length > 0) {
      for (const id of minions) winners.add(id);
      teams.push("werewolf");
      reason = "No werewolves in play at all — and the Minion watched the village hang an innocent.";
    } else {
      reason = "There were no werewolves, and the village hanged somebody regardless. Nobody wins.";
    }
  }

  return {
    tally,
    princeSaved,
    killed,
    hunterShot,
    winners: Array.from(winners),
    teams,
    reason,
  };
}

function closeVote(state: OnuwState, votes: Record<string, string>): OnuwState {
  const finalOf = (id: string) => cardOf(state, id)!;

  // votes cast at the Prince simply don't count; the village has to find
  // somebody else, and often can't
  const princeSaved: string[] = [];
  const counts = new Map<string, number>();
  for (const [voterId, targetId] of Object.entries(votes)) {
    if (finalOf(targetId) === "prince") {
      princeSaved.push(voterId);
      continue;
    }
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  const tally = state.players
    .filter((p) => counts.has(p.id))
    .map((p) => ({ id: p.id, count: counts.get(p.id)! }))
    .sort((a, b) => b.count - a.count);

  // "the most votes dies; ties all die; nobody dies unless somebody drew two"
  const top = tally[0]?.count ?? 0;
  const killed = top >= 2 ? tally.filter((t) => t.count === top).map((t) => t.id) : [];

  // a dying hunter takes whoever they pointed at
  let hunterShot: string | null = null;
  for (const id of killed) {
    if (finalOf(id) === "hunter") {
      const shot = votes[id];
      if (shot && !killed.includes(shot)) hunterShot = shot;
      break;
    }
  }
  const finalKilled = hunterShot ? [...killed, hunterShot] : killed;

  const outcome = judge(state, finalKilled, tally, princeSaved, hunterShot);

  let log = logged(
    state,
    finalKilled.length === 0
      ? "Nobody drew enough votes. The village kills no one."
      : `The village kills ${listOf(finalKilled.map((id) => nameOf(state, id)))}.`,
    "vote"
  );
  if (hunterShot) {
    log = [
      ...log,
      { text: `The Hunter took ${nameOf(state, hunterShot)} down too.`, kind: "death" },
    ];
  }
  log = [...log, { text: outcome.reason, kind: "dawn" }];

  return { ...state, phase: "ended", votes, outcome, log };
}

// ---------- dealing ----------

function deal(
  players: { id: string; name: string }[],
  lineup: Record<Role, number>
): { players: OnuwPlayer[]; slots: Role[] } {
  const bag: Role[] = [];
  for (const role of ROLES) for (let i = 0; i < (lineup[role] ?? 0); i++) bag.push(role);
  const slots = shuffle(bag);
  return {
    players: players.map((p, i) => ({ id: p.id, name: p.name, dealt: slots[i] })),
    slots,
  };
}

// ---------- the reducer ----------

export function reducer(state: OnuwState, action: Action): OnuwState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "START": {
      if (lineupProblem(action.lineup, action.players.length)) return state;
      const { players, slots } = deal(action.players, action.lineup);
      const notes: Record<string, Note[]> = {};
      for (const p of players) {
        notes[p.id] = [
          {
            step: "deal",
            text: `You were dealt the ${ROLE_INFO[p.dealt].name}.`,
            cards: [{ role: p.dealt, label: "Dealt to you" }],
          },
        ];
      }
      return {
        ...initialState(),
        phase: "deal",
        players,
        slots,
        notes,
        lineup: action.lineup,
        discussionSeconds: action.discussionSeconds,
        log: [{ text: "The cards are dealt. Three go face down in the middle.", kind: "night" }],
      };
    }

    case "DEAL_NEXT": {
      if (state.phase !== "deal") return state;
      const next = state.dealIndex + 1;
      if (next < state.players.length) return { ...state, dealIndex: next };
      return advance({ ...state, dealIndex: next, phase: "night" });
    }

    // ---------- the three steps that only show somebody something ----------

    case "WAKE_ACK": {
      const step = state.step;
      if (state.phase !== "night" || !step) return state;
      if (step !== "werewolf" && step !== "minion" && step !== "mason") return state;

      const actors = actorsOf(state, step);
      if (!actors.some((a) => a.id === action.playerId)) return state;
      if (state.acked.includes(action.playerId)) return state;

      let next = state;

      // a lone wolf is the only one in this group with a decision to make:
      // one look at one of the three in the middle
      if (
        step === "werewolf" &&
        actors.length === 1 &&
        action.centreSlot !== undefined &&
        isCentre(state, action.centreSlot)
      ) {
        next = addNote(next, action.playerId, {
          step,
          text: `You looked at ${centreName(state, action.centreSlot)} centre card.`,
          cards: [
            {
              role: state.slots[action.centreSlot],
              label: `${centreName(state, action.centreSlot)} centre card`,
            },
          ],
        });
      }

      const acked = [...next.acked, action.playerId];
      return acked.length >= actors.length
        ? finish({ ...next, acked }, step)
        : { ...next, acked };
    }

    // ---------- the roles that do something ----------

    case "SEER": {
      if (state.step !== "seer") return state;
      const seer = actorsOf(state, "seer")[0];
      if (!seer) return state;
      let next: OnuwState = { ...state, past: pushPast(state) };

      if (action.targetId) {
        const seat = seatOf(state, action.targetId);
        if (seat < 0 || action.targetId === seer.id) return state;
        next = addNote(next, seer.id, {
          step: "seer",
          text: `You looked at ${nameOf(state, action.targetId)}'s card.`,
          cards: [{ role: state.slots[seat], label: nameOf(state, action.targetId) }],
        });
      } else if (action.centreSlots.length > 0) {
        const picked = action.centreSlots.slice(0, 2);
        if (!picked.every((s) => isCentre(state, s))) return state;
        if (new Set(picked).size !== picked.length) return state;
        next = addNote(next, seer.id, {
          step: "seer",
          text: "You looked at two of the cards in the middle.",
          cards: picked.map((s) => ({
            role: state.slots[s],
            label: `${centreName(state, s)} centre card`,
          })),
        });
      } else {
        next = addNote(next, seer.id, {
          step: "seer",
          text: "You looked at nothing at all.",
          cards: [],
        });
      }
      return finish(next, "seer");
    }

    case "ROBBER": {
      if (state.step !== "robber") return state;
      const robber = actorsOf(state, "robber")[0];
      if (!robber) return state;

      if (!action.targetId) {
        return finish(
          addNote({ ...state, past: pushPast(state) }, robber.id, {
            step: "robber",
            text: "You kept your hands to yourself. You are still the Robber.",
            cards: [{ role: "robber", label: "Still yours" }],
          }),
          "robber"
        );
      }

      const mine = seatOf(state, robber.id);
      const theirs = seatOf(state, action.targetId);
      if (theirs < 0 || theirs === mine) return state;

      const slots = swapSlots(state.slots, mine, theirs);
      const taken = slots[mine];
      const next = addNote({ ...state, past: pushPast(state), slots }, robber.id, {
        step: "robber",
        text: `You took ${nameOf(state, action.targetId)}'s card and left them the Robber. You are now the ${ROLE_INFO[taken].name}.`,
        cards: [{ role: taken, label: "Now yours" }],
      });
      return finish(next, "robber");
    }

    case "WITCH_LOOK": {
      if (state.step !== "witch" || state.witchSaw !== null) return state;
      const witch = actorsOf(state, "witch")[0];
      if (!witch || !isCentre(state, action.centreSlot)) return state;

      const seen = state.slots[action.centreSlot];
      return addNote(
        { ...state, past: pushPast(state), witchSaw: action.centreSlot },
        witch.id,
        {
          step: "witch",
          text: `You turned over ${centreName(state, action.centreSlot)} centre card: the ${ROLE_INFO[seen].name}. Now it has to go on somebody.`,
          cards: [{ role: seen, label: `${centreName(state, action.centreSlot)} centre card` }],
        }
      );
    }

    case "WITCH_PLACE": {
      if (state.step !== "witch" || state.witchSaw === null) return state;
      const witch = actorsOf(state, "witch")[0];
      if (!witch) return state;
      const seat = seatOf(state, action.targetId);
      if (seat < 0) return state;

      const seen = state.slots[state.witchSaw];
      const slots = swapSlots(state.slots, state.witchSaw, seat);
      const next = addNote({ ...state, slots, witchSaw: null }, witch.id, {
        step: "witch",
        text: `You gave the ${ROLE_INFO[seen].name} to ${nameOf(state, action.targetId)} and their card went back to the middle. You never saw what it was.`,
        cards: [],
      });
      return finish(next, "witch");
    }

    case "WITCH_PASS": {
      if (state.step !== "witch" || state.witchSaw !== null) return state;
      const witch = actorsOf(state, "witch")[0];
      if (!witch) return state;
      return finish(
        addNote({ ...state, past: pushPast(state) }, witch.id, {
          step: "witch",
          text: "You left the middle alone, so nothing moved.",
          cards: [],
        }),
        "witch"
      );
    }

    case "TROUBLEMAKER": {
      if (state.step !== "troublemaker") return state;
      const tm = actorsOf(state, "troublemaker")[0];
      if (!tm) return state;

      if (!action.aId || !action.bId) {
        return finish(
          addNote({ ...state, past: pushPast(state) }, tm.id, {
            step: "troublemaker",
            text: "You caused no trouble tonight.",
            cards: [],
          }),
          "troublemaker"
        );
      }
      if (action.aId === action.bId) return state;
      const a = seatOf(state, action.aId);
      const b = seatOf(state, action.bId);
      // the Troublemaker swaps two OTHER people; never themselves
      if (a < 0 || b < 0 || action.aId === tm.id || action.bId === tm.id) return state;

      const next = addNote(
        { ...state, past: pushPast(state), slots: swapSlots(state.slots, a, b) },
        tm.id,
        {
          step: "troublemaker",
          text: `You swapped ${nameOf(state, action.aId)} and ${nameOf(state, action.bId)}. Neither of them knows, and neither do you.`,
          cards: [],
        }
      );
      return finish(next, "troublemaker");
    }

    case "DRUNK": {
      if (state.step !== "drunk") return state;
      const drunk = actorsOf(state, "drunk")[0];
      if (!drunk) return state;
      if (!isCentre(state, action.centreSlot)) return state;

      const mine = seatOf(state, drunk.id);
      const next = addNote(
        {
          ...state,
          past: pushPast(state),
          slots: swapSlots(state.slots, mine, action.centreSlot),
        },
        drunk.id,
        {
          step: "drunk",
          text: `You traded your card for ${centreName(state, action.centreSlot)} centre card without looking. You have no idea what you are now.`,
          cards: [],
        }
      );
      return finish(next, "drunk");
    }

    case "INSOMNIAC": {
      if (state.step !== "insomniac") return state;
      const sleeper = actorsOf(state, "insomniac")[0];
      if (!sleeper) return state;
      const now = state.slots[seatOf(state, sleeper.id)];

      const next = addNote({ ...state, past: pushPast(state) }, sleeper.id, {
        step: "insomniac",
        text:
          now === "insomniac"
            ? "You check your card. Still the Insomniac — nobody touched you."
            : `You check your card. It isn't yours any more: you are the ${ROLE_INFO[now].name}.`,
        cards: [{ role: now, label: "Yours, now" }],
      });
      return finish(next, "insomniac");
    }

    // ---------- daylight ----------

    case "TICK": {
      const step = state.step;
      // a step somebody holds is theirs to end, not the clock's
      if (state.phase !== "night" || !step || actorsOf(state, step).length > 0) {
        // deliberately a new object: a tick that changes nothing is normal, and
        // a room would otherwise report it to the sender as a refused move
        return { ...state };
      }
      return finish(state, step);
    }

    case "OPEN_VOTE": {
      if (state.phase !== "day") return state;
      return { ...state, past: pushPast(state), phase: "vote", votes: {} };
    }

    case "VOTE": {
      if (state.phase !== "vote") return state;
      const voter = state.players.find((p) => p.id === action.voterId);
      const target = state.players.find((p) => p.id === action.targetId);
      // everybody points, and nobody may point at themselves
      if (!voter || !target || voter.id === target.id) return state;

      const votes = { ...state.votes, [action.voterId]: action.targetId };
      const everyone = state.players.every((p) => p.id in votes);
      return everyone ? closeVote(state, votes) : { ...state, votes };
    }

    case "UNDO": {
      const past = [...state.past];
      const prev = past.pop();
      if (!prev) return state;
      return { ...(JSON.parse(prev) as Omit<OnuwState, "past">), past };
    }

    case "RESTART":
      return reducer(state, {
        type: "START",
        players: state.players.map((p) => ({ id: p.id, name: p.name })),
        lineup: state.lineup,
        discussionSeconds: state.discussionSeconds,
      });

    case "NEW_GAME":
      return {
        ...initialState(),
        players: state.players.map((p) => ({ ...p, dealt: "villager" as Role })),
        lineup: state.lineup,
        discussionSeconds: state.discussionSeconds,
      };

    default:
      return state;
  }
}
