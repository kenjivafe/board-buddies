"use client";

import { useEffect, useRef, useState } from "react";
import { ROLE_INFO } from "@/lib/werewolf/roles";
import type { Action } from "@/lib/werewolf/reducer";
import type { NightStep } from "@/lib/werewolf/types";
import {
  centreSlotsIn,
  notesFor,
  playerIn,
  wakers,
  type OnuwView,
  type PlayerView,
} from "@/lib/werewolf/view";
import {
  BEAT_SECONDS,
  CALL,
  DAWN,
  INSTRUCTION,
  LEAD_IN_SECONDS,
  OPENING,
  SLEEP,
  TASK,
  TITLE,
  callLeadMs,
  shown,
} from "@/lib/werewolf/narration";
import { BED_BAR_SECONDS } from "@/lib/werewolf/ambience";
import { sleepStem, wakeStem } from "@/lib/werewolf/voice";
import { Moon, Rule, Waiting } from "./Bits";
import { CentrePick, PickList, Shown } from "./Table";
import { MuteButton, useNarrator } from "./useNarrator";

type Props = { view: OnuwView; dispatch: React.Dispatch<Action> };

/** The people this step wakes, and one call to say they're finished. */
type PanelProps = Props & {
  actors: PlayerView[];
  /** true on one phone, where the woken role holds the device together */
  narrated: boolean;
  onActed: () => void;
};

const listOf = (names: string[]): string =>
  names.length <= 1
    ? names[0] ?? "nobody"
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The night, from whichever side of it you are on.
 *
 * The two modes are genuinely different experiences rather than one screen with
 * a flag, so they get a function each.
 */
export default function Night({
  view,
  dispatch,
  onDawn,
  called,
}: Props & {
  onDawn?: () => void;
  /** rooms only: the role the narrator has got as far as calling */
  called?: NightStep | null;
}) {
  return view.omniscient ? (
    <NarratedNight view={view} dispatch={dispatch} onDawn={onDawn ?? (() => {})} />
  ) : (
    <DeviceNight view={view} dispatch={dispatch} called={called ?? null} />
  );
}

// ============================================================
// one phone — the app is the moderator
// ============================================================

/**
 * The whole table sits in the dark and the app calls roles out loud, exactly
 * as a person would. Nobody is ever named: the call is "Werewolves, open your
 * eyes", and whoever that is picks the phone up. Between roles the screen goes
 * back to the dark for a beat, so the handover happens with everyone's eyes
 * already shut rather than in full view of the last person to act.
 */
function NarratedNight({ view, dispatch, onDawn }: Props & { onDawn: () => void }) {
  const step = view.step;
  /** the step whose call has been answered — while this lags `step`, we're in the dark */
  const [awakeAt, setAwakeAt] = useState<NightStep | null>(null);
  /** what the role that just acted found out, held on screen until they've read it */
  const [learned, setLearned] = useState<{ playerId: string; from: number } | null>(null);

  // Only the roles that are actually told something get held up on the way out;
  // for the rest this comes back empty and the night goes straight to the dark.
  const learnedNotes = learned ? notesFor(view, learned.playerId).slice(learned.from) : [];
  if (learnedNotes.length > 0) {
    return (
      <section className="gate">
        <span className="eyebrow">What you found out</span>
        <Shown notes={learnedNotes} />
        <Rule />
        <button className="btn btn-primary" onClick={() => setLearned(null)}>
          Read it — eyes shut
        </button>
        <p className="hint">Remember it. Nothing writes it down for you but this.</p>
      </section>
    );
  }

  /*
   * The night is out. It still owes the table two lines — the last role has to
   * be sent to bed, and everybody has to be woken — so this beat runs after the
   * phase has already turned to day. Without it the final role acted and the
   * screen simply cut to daylight, which meant the Insomniac never got to see
   * the card she had just checked.
   */
  if (!step) {
    return <Beat key="dawn" closing={awakeAt} calling="dawn" onAwake={onDawn} />;
  }

  const actors = wakers(view, step);

  if (awakeAt !== step) {
    return (
      <Beat
        key={step}
        closing={awakeAt}
        calling={step}
        empty={actors.length === 0}
        // an empty step is ticked past rather than handed over; the phone is
        // the moderator here, so it is allowed to know there was nobody
        onAwake={
          actors.length === 0
            ? () => {
                setAwakeAt(step);
                dispatch({ type: "TICK" });
              }
            : () => setAwakeAt(step)
        }
      />
    );
  }

  return (
    <>
      <NightHead step={step} />
      <StepPanel
        view={view}
        dispatch={dispatch}
        step={step}
        actors={actors}
        narrated
        onActed={() =>
          setLearned({
            playerId: actors[0]?.id ?? "",
            from: notesFor(view, actors[0]?.id ?? "").length,
          })
        }
      />
    </>
  );
}

/**
 * The dark between two roles. The role that just acted is sent back to sleep,
 * the table waits, and only then is the next role called — so the phone changes
 * hands while everyone else's eyes are already shut.
 */
function Beat({
  closing,
  calling,
  onAwake,
  empty = false,
}: {
  closing: NightStep | null;
  /** a role to wake, or "dawn" — the last beat, which wakes the whole table */
  calling: NightStep | "dawn";
  onAwake: () => void;
  /**
   * Nobody was dealt this one. It is still called — skipping it would tell the
   * table the card is in the middle — but there is nobody to hand the phone to,
   * so the night pauses on it and then moves itself along.
   */
  empty?: boolean;
}) {
  const { enqueue } = useNarrator();
  const dawn = calling === "dawn";
  /**
   * The very first beat of the night is the only one with nothing to send to
   * bed, so it is the one that holds while the wood comes up underneath.
   */
  const lead = closing === null && !dawn;

  /*
   * There is no countdown here, and there is no clock here.
   *
   * There used to be one, ticking whole seconds, and it was a second opinion
   * about when things happen. Every change to the script — the beat, the wait
   * for a bar line, the length of a line — moved the audio and left the number
   * describing the old timing, and it was wrong again every time. The queue
   * already knows when each thing starts; these two say only *whether* it has,
   * and the audio sets them as it goes.
   */
  const [spoke, setSpoke] = useState(false);
  const [ready, setReady] = useState(false);

  /**
   * Whether this beat has already been handed to the narrator.
   *
   * Queueing is not something that can be done twice. Strict mode runs every
   * effect setup, cleanup, setup — which used to be invisible here, because
   * the old one-shot `say` cut off whatever was playing and the second call
   * simply replaced the first. A queue appends, so the same run went in twice
   * and the whole night was read out double.
   *
   * A ref rather than a dep, because there is nothing to react to: one beat
   * has exactly one script, and `key={step}` means a genuinely new beat is a
   * genuinely new component with a fresh one of these.
   */
  const read = useRef(false);

  /*
   * The whole run goes in at once, in order: the last role to bed, a beat, then
   * the call — the role's sound and its name together, dropped on a bar line.
   *
   * Queued rather than timed, so a role nobody holds is still called in full:
   * the move-along waits behind the line instead of racing it.
   */
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    enqueue([
      // the first beat of the night is the only one with nothing to send to
      // bed, so it is the one that holds while the wood comes up underneath
      ...(lead ? [{ pause: LEAD_IN_SECONDS * 1000 }] : []),
      { line: closing ? sleepStem(closing) : "open", onStart: () => setSpoke(true) },
      { pause: callLeadMs(BED_BAR_SECONDS) },
      dawn
        ? { line: "dawn", onStart: () => setReady(true) }
        : {
            line: wakeStem(calling),
            sting: calling,
            bar: true,
            onStart: () => setReady(true),
          },
      // a role nobody holds has nobody to hand the phone to, so the night gives
      // it the same pause everyone else gets and then moves itself along
      ...(empty ? [{ pause: BEAT_SECONDS * 900 }, { then: onAwake }] : []),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calling, empty]);

  return (
    <section className="beat">
      <MuteButton />
      <Moon size={72} phase={dawn ? 0 : 0.24} className={dawn && ready ? "sun" : undefined} />
      {spoke ? (
        <p className="beat-line">{shown(closing ? SLEEP[closing] : OPENING)}</p>
      ) : (
        // nothing but the moon while the wood rises
        <p className="beat-line dim" aria-hidden />
      )}

      {ready ? (
        <>
          <p className="beat-call">{shown(dawn ? DAWN : CALL[calling])}</p>
          {!dawn && <p className="beat-instruction">{INSTRUCTION[calling]}</p>}
          {empty ? (
            <p className="hint" role="status">
              Nobody stirs.
            </p>
          ) : (
            <>
              <button className="btn btn-primary" onClick={onAwake}>
                {dawn ? "Everybody up" : "That's me — I have the phone"}
              </button>
              <p className="hint">
                {dawn ? "That's the night over. Now argue." : "Everyone else, eyes shut."}
              </p>
            </>
          )}
        </>
      ) : (
        // the dark between two roles, with nothing counting in it. A number
        // here was only ever the app promising a moment it then had to keep,
        // and the moderator it is imitating does not count out loud either.
        <p className="hint" role="status">
          {spoke ? "Waiting for the table to settle…" : "Night falls over the village."}
        </p>
      )}
    </section>
  );
}

// ============================================================
// separate devices — nobody hands anything over
// ============================================================

/**
 * Your own screen wakes you when you're wanted and tells you nothing when you
 * aren't.
 *
 * It waits for the call. The state moves the instant the last role acts, and a
 * screen that appeared with it let a quick player answer before the moderator
 * had said a word — the next call then queued behind a line still being read,
 * and a few roles in, the voice was a whole turn behind the table. Now the
 * prompt arrives when the voice does, which is the same rule the one-phone
 * night plays by.
 */
function DeviceNight({ view, dispatch, called }: Props & { called: NightStep | null }) {
  const step = view.step;
  const me = view.selfId ? playerIn(view, view.selfId) : null;

  if (!step || !me || called !== step) return <Asleep view={view} />;

  return (
    <>
      <NightHead step={step} />
      <StepPanel
        view={view}
        dispatch={dispatch}
        step={step}
        actors={[me]}
        narrated={false}
        /*
         * Nothing to do. On one phone this opens a gate, because the device is
         * about to change hands and what you were shown has to come off the
         * screen before it does. A room passes nothing, so there is nothing to
         * dismiss for — see Asleep, which simply keeps it up.
         */
        onActed={() => {}}
      />
    </>
  );
}

function NightHead({ step }: { step: NightStep }) {
  return (
    <>
      <header className="night-head">
        <Moon size={40} phase={0.25} />
        <span className="night-title">
          <span className="eyebrow">Night</span>
          <strong>{TITLE[step]}</strong>
        </span>
      </header>
      <p className="ww-sub" style={{ marginTop: 4 }}>
        {TASK[step]}
      </p>
    </>
  );
}

function StepPanel({ step, ...rest }: PanelProps & { step: NightStep }) {
  switch (step) {
    case "werewolf":
      return <WolfPanel {...rest} />;
    case "minion":
    case "mason":
      return <TellPanel {...rest} step={step} />;
    case "seer":
      return <SeerPanel {...rest} />;
    case "robber":
      return <RobberPanel {...rest} />;
    case "witch":
      return <WitchPanel {...rest} />;
    case "troublemaker":
      return <TroublemakerPanel {...rest} />;
    case "drunk":
      return <DrunkPanel {...rest} />;
    case "insomniac":
      return <InsomniacPanel {...rest} />;
  }
}

const others = (view: OnuwView, id: string): PlayerView[] =>
  view.players.filter((p) => p.id !== id);

/** The notes this step has already written for whoever is holding the phone. */
function Told({ view, actors }: { view: OnuwView; actors: PlayerView[] }) {
  const notes = actors
    .flatMap((a) => notesFor(view, a.id))
    .filter((n) => n.step === view.step);
  return <Shown notes={notes} label="What you can see" />;
}

// ---------- the pack ----------

function WolfPanel({ view, dispatch, actors, narrated, onActed }: PanelProps) {
  const alone = narrated ? actors.length === 1 : view.groupSize === 1;
  const [slot, setSlot] = useState<number | null>(null);
  const waiting = !narrated && view.acked.includes(actors[0].id);

  const done = () => {
    onActed();
    // on one phone the pack is awake together at one screen, so one tap
    // answers for all of them
    for (const wolf of actors) {
      dispatch({
        type: "WAKE_ACK",
        playerId: wolf.id,
        centreSlot: slot ?? undefined,
      });
    }
  };

  if (waiting) {
    return (
      <div className="ww-section">
        <Waiting text="You've looked." on={`Waiting on ${view.waitingOn} more of the pack.`} />
      </div>
    );
  }

  return (
    <>
      {narrated ? (
        <section className="reading">
          <span className="eyebrow">The pack is</span>
          <span className="reading-verdict">
            {alone ? "just you" : listOf(actors.map((a) => a.name))}
          </span>
        </section>
      ) : (
        <Told view={view} actors={actors} />
      )}

      {alone && (
        <section className="ww-section">
          <Rule>Alone in the woods</Rule>
          <p className="ww-sub">
            No pack means one consolation: you may turn over a single card from the middle.
          </p>
          <CentrePick
            slots={centreSlotsIn(view)}
            selected={slot === null ? [] : [slot]}
            onPick={(s) => setSlot(slot === s ? null : s)}
          />
        </section>
      )}

      <Rule />
      <button className="btn btn-primary" onClick={done}>
        {alone && slot !== null ? "Look at it, then sleep" : "Got it"}
      </button>
    </>
  );
}

/** The Minion and the Masons: shown something, with nothing to decide. */
function TellPanel({ view, dispatch, actors, narrated, onActed, step }: PanelProps & { step: NightStep }) {
  const waiting = !narrated && view.acked.includes(actors[0].id);

  const done = () => {
    onActed();
    for (const a of actors) dispatch({ type: "WAKE_ACK", playerId: a.id });
  };

  return (
    <>
      {narrated && step === "mason" ? (
        <section className="reading">
          <span className="eyebrow">The Masons are</span>
          <span className="reading-verdict">
            {actors.length > 1 ? listOf(actors.map((a) => a.name)) : "just you"}
          </span>
        </section>
      ) : null}

      <Told view={view} actors={actors} />
      <Rule />
      {waiting ? (
        <Waiting text="You've looked." on={`Waiting on ${view.waitingOn} more.`} />
      ) : (
        <button className="btn btn-primary" onClick={done}>
          Got it
        </button>
      )}
    </>
  );
}

// ---------- the seer ----------

function SeerPanel({ view, dispatch, actors, onActed }: PanelProps) {
  const actorId = actors[0].id;
  const [who, setWho] = useState<string | null>(null);
  const [slots, setSlots] = useState<number[]>([]);

  const pickPlayer = (id: string) => {
    setSlots([]);
    setWho(who === id ? null : id);
  };
  const pickSlot = (s: number) => {
    setWho(null);
    setSlots((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < 2 ? [...cur, s] : [cur[1], s]
    );
  };

  const look = (targetId: string | null, centreSlots: number[]) => {
    onActed();
    dispatch({ type: "SEER", targetId, centreSlots });
  };

  return (
    <>
      <Rule>One player</Rule>
      <PickList
        people={others(view, actorId)}
        selected={who ? [who] : []}
        onPick={pickPlayer}
        label="Whose card to look at"
      />

      <Rule>…or two from the middle</Rule>
      <CentrePick slots={centreSlotsIn(view)} selected={slots} onPick={pickSlot} />

      <Rule />
      <button
        className="btn btn-primary"
        disabled={who === null && slots.length !== 2}
        onClick={() => look(who, slots)}
      >
        {who
          ? `Look at ${playerIn(view, who)?.name}`
          : slots.length === 2
            ? "Look at both"
            : "Pick one, or two from the middle"}
      </button>
      <button className="btn btn-ghost" onClick={() => look(null, [])}>
        Look at nothing
      </button>
    </>
  );
}

// ---------- the robber ----------

function RobberPanel({ view, dispatch, actors, onActed }: PanelProps) {
  const actorId = actors[0].id;
  /*
   * Picked, then confirmed — the way the Seer and the Troublemaker already
   * work. This one committed on the first tap, which put the least reversible
   * decision in the game one stray thumb away and gave no chance to change
   * your mind about a card you cannot give back.
   */
  const [who, setWho] = useState<string | null>(null);
  const take = (targetId: string | null) => {
    onActed();
    dispatch({ type: "ROBBER", targetId });
  };

  return (
    <>
      <PickList
        people={others(view, actorId)}
        selected={who ? [who] : []}
        onPick={(id) => setWho(who === id ? null : id)}
        label="Who to rob"
      />
      <Rule />
      <button className="btn btn-primary" disabled={who === null} onClick={() => take(who)}>
        {who ? `Rob ${playerIn(view, who)?.name}` : "Pick somebody"}
      </button>
      <button className="btn btn-ghost" onClick={() => take(null)}>
        Rob nobody — stay the Robber
      </button>
    </>
  );
}

// ---------- the witch ----------

function WitchPanel({ view, dispatch, actors, onActed }: PanelProps) {
  const held = view.witchSaw;
  const [plantOn, setPlantOn] = useState<string | null>(null);

  // she has turned one over, and now it has to go somewhere
  if (held !== null) {
    return (
      <>
        <Told view={view} actors={actors} />
        <Rule>Now plant it</Rule>
        <p className="ww-sub">
          It has to go on somebody, and whatever they were holding goes back to the middle. You
          will not see what that was.
        </p>
        <PickList
          people={view.players}
          selected={plantOn ? [plantOn] : []}
          onPick={(id) => setPlantOn(plantOn === id ? null : id)}
          label="Who to plant it on"
          tagFor={(p) => (p.id === actors[0].id ? "You" : null)}
        />
        <Rule />
        <button
          className="btn btn-primary"
          disabled={plantOn === null}
          onClick={() => {
            onActed();
            dispatch({ type: "WITCH_PLACE", targetId: plantOn! });
          }}
        >
          {plantOn ? `Plant it on ${playerIn(view, plantOn)?.name}` : "Pick somebody"}
        </button>
      </>
    );
  }

  return (
    <>
      <p className="ww-sub" style={{ marginTop: 10 }}>
        The moment you look, you are committed — it has to go on somebody.
      </p>
      <CentrePick
        slots={centreSlotsIn(view)}
        selected={[]}
        onPick={(centreSlot) => dispatch({ type: "WITCH_LOOK", centreSlot })}
      />
      <Rule />
      <button
        className="btn btn-ghost"
        onClick={() => {
          onActed();
          dispatch({ type: "WITCH_PASS" });
        }}
      >
        Leave the middle alone
      </button>
    </>
  );
}

// ---------- the troublemaker ----------

function TroublemakerPanel({ view, dispatch, actors, onActed }: PanelProps) {
  const actorId = actors[0].id;
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 2 ? [...cur, id] : [cur[1], id]
    );

  const swap = (aId: string | null, bId: string | null) => {
    onActed();
    dispatch({ type: "TROUBLEMAKER", aId, bId });
  };

  return (
    <>
      <PickList
        people={others(view, actorId)}
        selected={picked}
        onPick={toggle}
        label="Two to swap"
      />
      <Rule />
      <button
        className="btn btn-primary"
        disabled={picked.length !== 2}
        onClick={() => swap(picked[0], picked[1])}
      >
        {picked.length === 2
          ? `Swap ${listOf(picked.map((p) => playerIn(view, p)?.name ?? ""))}`
          : "Pick two"}
      </button>
      <button className="btn btn-ghost" onClick={() => swap(null, null)}>
        Cause no trouble
      </button>
    </>
  );
}

// ---------- the drunk ----------

function DrunkPanel({ view, dispatch, onActed }: PanelProps) {
  const [slot, setSlot] = useState<number | null>(null);
  return (
    <>
      <CentrePick
        slots={centreSlotsIn(view)}
        selected={slot === null ? [] : [slot]}
        onPick={(s) => setSlot(slot === s ? null : s)}
      />
      <p className="hint" style={{ marginTop: 12 }}>
        You will not be told what you get. From here you genuinely do not know what you are.
      </p>
      <Rule />
      <button
        className="btn btn-primary"
        disabled={slot === null}
        onClick={() => {
          onActed();
          dispatch({ type: "DRUNK", centreSlot: slot! });
        }}
      >
        {slot === null ? "Pick one from the middle" : "Take it, and don't look"}
      </button>
    </>
  );
}

// ---------- the insomniac ----------

function InsomniacPanel({ dispatch, onActed }: PanelProps) {
  return (
    <>
      <Rule />
      <button
        className="btn btn-primary"
        onClick={() => {
          onActed();
          dispatch({ type: "INSOMNIAC" });
        }}
      >
        Look at my own card
      </button>
    </>
  );
}

// ---------- everybody else ----------

/** A dark screen. It is deliberately the least informative thing in the app. */
/**
 * Your own screen for the rest of the night, with whatever you found out still
 * on it.
 *
 * There was a "read it, back to sleep" gate here for a moment, and it was the
 * wrong shape twice over. It blocked nothing — the night is paced by the
 * server and your turn is already over — so the button dismissed a modal that
 * was holding up nothing at all. And because the day screen replaces the night
 * whole, a reveal nobody had dismissed could be taken away mid-read when the
 * argument opened.
 *
 * So it is not a gate. A player is woken once a night, which means everything
 * they ever learn comes from that one step: it goes up when they act and stays
 * up until morning, at full size, where nothing can cut it off and there is
 * nothing to tap. The compact notebook takes over on the day screen, which is
 * where a reference belongs.
 */
function Asleep({ view }: { view: OnuwView }) {
  const found = (view.self?.notes ?? []).filter((n) => n.step !== "deal");
  return (
    <>
      <section className="sleeping">
        <Moon size={74} phase={0.22} />
        <span className="eyebrow">Night</span>
        <p className="sleeping-note">
          The village sleeps. Eyes shut — this will wake you if somebody wants you.
        </p>
      </section>
      {found.length > 0 && <Shown notes={found} label="What you found out" />}
    </>
  );
}
