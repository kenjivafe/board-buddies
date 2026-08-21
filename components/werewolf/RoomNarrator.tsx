"use client";

import { useEffect, useRef } from "react";
import {
  BEAT_SECONDS,
  DAWN_HOLD_SECONDS,
  LEAD_IN_SECONDS,
  SETTLE_SECONDS,
  callLeadMs,
} from "@/lib/werewolf/narration";
import type { Action } from "@/lib/werewolf/reducer";
import type { NightStep } from "@/lib/werewolf/types";
import type { OnuwView } from "@/lib/werewolf/view";
import { sleepStem, wakeStem } from "@/lib/werewolf/voice";
import { BED_BAR_SECONDS } from "@/lib/werewolf/ambience";
import { MuteButton, useNarrator, useScene } from "./useNarrator";

/**
 * Longer than the call can possibly take — see the backstop below.
 *
 * Generous on purpose. It is measured against the worst case, where every clip
 * has to fall back on its watchdog rather than reporting that it ended, and it
 * only ever matters when the audio has failed in a way nothing else catches.
 * Firing it early would cut a line off; firing it late costs a broken table a
 * few seconds once.
 */
const BACKSTOP_MS = 45_000;

/**
 * The script, read on every device.
 *
 * The obvious worry — that a phone which speaks only when *its own* owner is
 * wanted would announce that owner to the room — does not apply, because every
 * phone reads every line. `narrate` is public and every role in the box is
 * called whether or not anybody holds it, so all of them have exactly the same
 * thing to say at the same moment and none of them says anything about whoever
 * is holding it.
 *
 * Running it only on the host's device was the wrong default: it assumes the
 * whole table is within earshot of one handset that happens to be face up.
 * Anybody playing over a call heard nothing at all. Each player has their own
 * mute, so a table sitting together can silence all but one.
 *
 * `paces` is separate, and is the host's alone — one device drives the state.
 * Every role in the box is called, so a role nobody was dealt has nobody to
 * answer for it; once its line has been read and given its beat, the pacer
 * ticks and the reducer moves on — but only if that step really was empty, so
 * the pacer is never told which ones were. A role somebody *does* hold ends
 * its own step by acting, and the next line waits for it.
 */
export default function RoomNarrator({
  view,
  dispatch,
  paces,
  onCalled,
  dawning,
  onDawned,
  onNight,
}: {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
  /** host only: drive the night along, as distinct from reading it aloud */
  paces: boolean;
  /** told which role has actually been called, so the screen can wait for it */
  onCalled: (step: NightStep | null) => void;
  /** the phase says day, but the night has not finished speaking */
  dawning: boolean;
  /** …and now it has */
  onDawned: () => void;
  /** a fresh night, so whoever is holding that flag can put it down */
  onNight: () => void;
}) {
  const { enqueue } = useNarrator();
  const spoken = useRef<NightStep | null>(null);
  /** what the night is on *now*, so a late cue can tell it has been overtaken */
  const live = useRef<NightStep | null>(null);
  const backstop = useRef<number | undefined>(undefined);
  /** the closing run is one script, and strict mode would otherwise queue it twice */
  const dawnRun = useRef(false);
  const dawnStop = useRef<number | undefined>(undefined);

  /*
   * Still night while the night is still talking. The cockerel is the sound of
   * the phase changing, and the phase changes the instant the last role acts —
   * which is two lines before the table is actually awake, so it used to crow
   * over "Insomniac, close your eyes".
   */
  useScene(
    view.phase === "night" || dawning
      ? "night"
      : view.phase === "day" || view.phase === "vote"
        ? "day"
        : "off"
  );

  // a new night — or a re-deal — puts the closing script back in its box
  useEffect(() => {
    if (view.phase === "night" || view.phase === "deal") {
      dawnRun.current = false;
      onNight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);

  const step = view.narrate;

  /*
   * Queued, never fired on a timer.
   *
   * The state moves at the table's pace, not the script's: a role that answers
   * in a second, or one nobody was dealt, used to have its line cut off by the
   * next call landing on top of it. Handing the whole run to the queue means
   * every line is read in full and in order however fast the night moves.
   */
  useEffect(() => {
    if (view.phase !== "night" || !step) return;
    if (spoken.current === step) return;

    const closing = spoken.current;
    spoken.current = step;
    live.current = step;
    // shut the last role's screen the moment the state moves, whatever the
    // voice is still finishing — nobody should be able to act out of turn
    onCalled(null);

    /** a cue that has been overtaken must not fire; it would skip a role */
    const still = () => live.current === step;

    enqueue([
      // a beat first: the state moved because somebody just acted, and the
      // script coming straight back over them is what makes a fast table feel
      // hurried along
      ...(closing
        ? [{ pause: SETTLE_SECONDS * 1000 }, { line: sleepStem(closing) }]
        : /*
           * Nothing to send to bed means this is the first call of the night,
           * and the night has to be started before anybody is called into it.
           * A room went straight from the deal to "Werewolves, wake up" with
           * nobody told to shut their eyes first — the one line the whole
           * table is listening for, and only one phone was saying it.
           */
          [{ pause: LEAD_IN_SECONDS * 1000 }, { line: "open" }]),
      { pause: callLeadMs(BED_BAR_SECONDS) },
      // the role's sound and its name at the same instant, dropped on the bed's
      // next bar line rather than wherever the queue happened to arrive
      { line: wakeStem(step), sting: step, bar: true },
      // and only now does whoever holds it get a screen to act on
      { then: () => still() && onCalled(step) },
      /*
       * And then a tick, which does nothing at all unless the step turned out
       * to wake nobody. Sent blind on purpose: if this waited on "is anyone
       * awake?" the pacer's phone would know which roles were in the middle.
       * It sits at the end of the queue, so a role nobody holds still gets its
       * line read out before the night moves past it. Only one device sends
       * it, or they would trip over each other.
       */
      ...(paces
        ? [
            { pause: BEAT_SECONDS * 1000 },
            { then: () => still() && dispatch({ type: "TICK" }) },
          ]
        : []),
    ]);

    /*
     * And a backstop, well past the longest the run above can take. Waiting for
     * the voice means a queue that never finishes is a player who can never
     * act and a night that can never end — and audio is exactly the sort of
     * thing a browser refuses without warning. Late is fine; stuck is not.
     */
    window.clearTimeout(backstop.current);
    backstop.current = window.setTimeout(() => {
      if (!still()) return;
      onCalled(step);
      if (paces) dispatch({ type: "TICK" });
    }, BACKSTOP_MS);
    // deliberately no cleanup: this effect re-runs on things other than the
    // step, and tearing the timer down on one of those would strand the night
    // in the very case the backstop exists for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view.phase, paces]);

  useEffect(
    () => () => {
      window.clearTimeout(backstop.current);
      window.clearTimeout(dawnStop.current);
    },
    []
  );

  // the last lines of the script, once the night has run out
  useEffect(() => {
    if (view.phase !== "day" && view.phase !== "vote") return;
    if (dawnRun.current) return;
    dawnRun.current = true;

    const last = spoken.current;
    spoken.current = null;
    live.current = null;
    window.clearTimeout(backstop.current);
    onCalled(null);

    /*
     * Nothing owed. Somebody who opened the room, or reloaded it, after the
     * argument had already started never heard a night and must not be held in
     * the dark waiting for the end of one.
     */
    if (!last) {
      onDawned();
      return;
    }

    // the last role finishing is the one moment nobody is expecting to be
    // spoken to, so the night hangs before the table is woken
    enqueue([
      { pause: SETTLE_SECONDS * 1000 },
      { line: sleepStem(last) },
      { pause: DAWN_HOLD_SECONDS * 1000 },
      { line: "dawn" },
      // and only now is it morning: the cockerel and the argument both wait
      // behind the last thing the moderator has to say
      { then: onDawned },
    ]);

    // and the same backstop the calls get, for the same reason: a queue that
    // never finishes must not leave the whole table sitting in the dark
    window.clearTimeout(dawnStop.current);
    dawnStop.current = window.setTimeout(onDawned, BACKSTOP_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);

  return <MuteButton inBar />;
}
