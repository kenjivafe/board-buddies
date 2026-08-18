"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioCue } from "@/lib/coup/types";
import { fileFor } from "@/lib/coup/voice";

const MUTE_KEY = "coup:voice-muted";
/** a breath between lines, so a run of them doesn't trample itself */
const GAP_MS = 220;

/**
 * Plays the voice lines a game state raises, in order and one at a time.
 *
 * Cues carry monotonic ids, so a state pushed twice — which rooms do constantly
 * — never replays a line. Anything already heard before this hook mounted is
 * skipped rather than fired off at once.
 */
export function useVoice(cues: AudioCue[] | undefined) {
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const lastPlayed = useRef(-1);
  const queue = useRef<string[]>([]);
  const playing = useRef(false);
  const element = useRef<HTMLAudioElement | null>(null);

  // on by default — the voices are the point — but the choice sticks
  useEffect(() => {
    setMuted(localStorage.getItem(MUTE_KEY) === "on");
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setMuted((was) => {
      const next = !was;
      try {
        localStorage.setItem(MUTE_KEY, next ? "on" : "off");
      } catch {
        /* private browsing — the choice just won't stick */
      }
      if (next) {
        queue.current = [];
        element.current?.pause();
      }
      return next;
    });
  }, []);

  const drain = useCallback(() => {
    if (playing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    playing.current = true;

    const audio = element.current ?? new Audio();
    element.current = audio;
    audio.src = next;
    audio.onended = audio.onerror = () => {
      playing.current = false;
      // A missing file is not a failure worth surfacing: the lines are
      // generated separately and the game must play fine without them.
      setTimeout(drain, GAP_MS);
    };
    void audio.play().catch(() => {
      // autoplay refused until the page has been interacted with
      playing.current = false;
    });
  }, []);

  useEffect(() => {
    if (!ready || !cues || cues.length === 0) return;

    // On first sight of a game, catch up silently rather than playing history.
    if (lastPlayed.current < 0) {
      lastPlayed.current = Math.max(...cues.map((c) => c.id));
      return;
    }

    const fresh = cues.filter((c) => c.id > lastPlayed.current).sort((a, b) => a.id - b.id);
    if (fresh.length === 0) return;
    lastPlayed.current = fresh[fresh.length - 1].id;

    if (muted) return;
    for (const c of fresh) {
      const file = fileFor(c.path);
      if (file) queue.current.push(file);
    }
    drain();
  }, [cues, muted, ready, drain]);

  return { muted, toggle, ready };
}
