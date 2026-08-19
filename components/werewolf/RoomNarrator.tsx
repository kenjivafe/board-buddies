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
 * One phone speaks for the table.
 *
 * A room has one moderator's voice, not one per device: every handset reading
 * the script would talk over the others, and a phone that speaks only when its
 * own owner is wanted announces that owner to everybody sitting near it. So the
 * host's device narrates and nobody else's makes a sound, exactly as if a
 * person were running the game — while each player's own screen quietly holds
 * whatever is private to them.
 *
 * It paces the night as well as reading it. Every role in the box is called,
 * so a role nobody was dealt has nobody to answer for it; after the line has
 * been said and given its beat, this sends a tick and the reducer moves on —
 * but only if that step really was empty, so the host is never told which ones
 * were. A role somebody *does* hold ends its own step by acting, and the next
 * line does not start until it has.
 */
export default function RoomNarrator({
  view,
  dispatch,
}: {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
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
     * the host's phone would know which roles were in the middle.
     */
    after(lead + STING_LEAD_MS + BEAT_SECONDS * 1000, () => dispatch({ type: "TICK" }));

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view.phase]);

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
