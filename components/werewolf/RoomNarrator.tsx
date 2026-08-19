"use client";

import { useEffect, useRef } from "react";
import { BEAT_SECONDS } from "@/lib/werewolf/narration";
import type { Action } from "@/lib/werewolf/reducer";
import type { NightStep } from "@/lib/werewolf/types";
import type { OnuwView } from "@/lib/werewolf/view";
import { sleepStem, wakeStem } from "@/lib/werewolf/voice";
import { STING_LEAD_MS } from "@/lib/werewolf/ambience";
import { MuteButton, useNarrator, useScene } from "./useNarrator";

/** longer than the call can possibly take; see the backstop below */
const BACKSTOP_MS = 25_000;

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
}: {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
  /** host only: drive the night along, as distinct from reading it aloud */
  paces: boolean;
  /** told which role has actually been called, so the screen can wait for it */
  onCalled: (step: NightStep | null) => void;
}) {
  const { enqueue } = useNarrator();
  const spoken = useRef<NightStep | null>(null);
  /** what the night is on *now*, so a late cue can tell it has been overtaken */
  const live = useRef<NightStep | null>(null);
  const backstop = useRef<number | undefined>(undefined);

  useScene(
    view.phase === "night" ? "night" : view.phase === "day" || view.phase === "vote" ? "day" : "off"
  );

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
      ...(closing ? [{ line: sleepStem(closing) }] : []),
      { pause: closing ? BEAT_SECONDS * 1000 : 0 },
      { sting: step },
      { pause: STING_LEAD_MS },
      { line: wakeStem(step) },
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

  useEffect(() => () => window.clearTimeout(backstop.current), []);

  // the last line of the script, once the night has run out
  useEffect(() => {
    if (view.phase !== "day" || spoken.current === null) return;
    const last = spoken.current;
    spoken.current = null;
    live.current = null;
    window.clearTimeout(backstop.current);
    onCalled(null);
    enqueue([{ line: sleepStem(last) }, { pause: 700 }, { line: "dawn" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);

  return <MuteButton inBar />;
}
