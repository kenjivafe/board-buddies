"use client";

import { useEffect, useRef } from "react";
import { BEAT_SECONDS } from "@/lib/werewolf/narration";
import type { Action } from "@/lib/werewolf/reducer";
import type { NightStep } from "@/lib/werewolf/types";
import type { OnuwView } from "@/lib/werewolf/view";
import { sleepStem, wakeStem } from "@/lib/werewolf/voice";
import { STING_LEAD_MS } from "@/lib/werewolf/ambience";
import { MuteButton, useNarrator, useScene } from "./useNarrator";

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
}: {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
  /** host only: drive the night along, as distinct from reading it aloud */
  paces: boolean;
}) {
  const { say, sting } = useNarrator();
  const spoken = useRef<NightStep | null>(null);
  const timers = useRef<number[]>([]);

  useScene(
    view.phase === "night" ? "night" : view.phase === "day" || view.phase === "vote" ? "day" : "off"
  );

  const step = view.narrate;

  useEffect(() => {
    const clear = () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    };
    const after = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    clear();
    if (view.phase !== "night" || !step) return clear;
    if (spoken.current === step) return clear;

    const closing = spoken.current;
    spoken.current = step;

    // send the last role to bed, hold the dark for a beat, then make the call
    if (closing) say(sleepStem(closing));
    const lead = closing ? BEAT_SECONDS * 1000 : 0;

    after(lead, () => sting(step));
    after(lead + STING_LEAD_MS, () => say(wakeStem(step)));
    /*
     * And then a tick, which does nothing at all unless the step turned out to
     * wake nobody. Sent blind on purpose: if this waited on "is anyone awake?"
     * the pacer's phone would know which roles were in the middle. Only one
     * device sends it, or they would trip over each other.
     */
    if (paces) {
      after(lead + STING_LEAD_MS + BEAT_SECONDS * 1000, () => dispatch({ type: "TICK" }));
    }

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view.phase, paces]);

  // the last line of the script, once the night has run out
  useEffect(() => {
    if (view.phase === "day" && spoken.current !== null) {
      const last = spoken.current;
      spoken.current = null;
      say(sleepStem(last));
      const t = window.setTimeout(() => say("dawn"), BEAT_SECONDS * 400);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);

  return <MuteButton inBar />;
}
