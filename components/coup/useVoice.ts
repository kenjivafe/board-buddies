"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioCue } from "@/lib/coup/types";
import { fileFor, freshCues, primeFrom } from "@/lib/coup/voice";

const MUTE_KEY = "coup:voice-muted";
/** a breath between lines, so a run of them doesn't trample itself */
const GAP_MS = 220;
/** fallback when a clip's duration is unknown, so the queue cannot wedge */
const MAX_CLIP_MS = 8000;

/**
 * Plays the voice lines a game state raises, in order and one at a time.
 *
 * Cues carry monotonic ids, so a state pushed twice — which rooms do constantly
 * — never replays a line. Anything already heard before this hook mounted is
 * skipped rather than fired off at once.
 */
export interface VoiceControls {
  muted: boolean;
  toggle: () => void;
  ready: boolean;
}

export function useVoice(cues: AudioCue[] | undefined) {
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const lastPlayed = useRef(0);
  const primed = useRef(false);
  const queue = useRef<string[]>([]);
  const playing = useRef(false);
  const element = useRef<HTMLAudioElement | null>(null);
  const watchdog = useRef<number | undefined>(undefined);

  // on by default — the voices are the point — but the choice sticks
  useEffect(() => {
    setMuted(localStorage.getItem(MUTE_KEY) === "on");
    setReady(true);
  }, []);

  useEffect(() => () => window.clearTimeout(watchdog.current), []);

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

    /*
     * Every route out of a clip has to reach here exactly once.
     *
     * Relying on `ended` alone stalled the queue for good: the last clip of a
     * finished game never fired it, so the two lines behind it — including the
     * dying influence's — were left sitting in the queue. A refused play() was
     * a dead end too. Media events are best-effort, so a watchdog backs them up
     * and nothing can wedge the run.
     */
    let moved = false;
    const advance = () => {
      if (moved) return;
      moved = true;
      window.clearTimeout(watchdog.current);
      playing.current = false;
      window.setTimeout(drain, GAP_MS);
    };

    audio.onended = advance;
    // a missing file is silent by design — the lines are generated separately
    audio.onerror = advance;
    audio.src = next;

    void audio.play().then(
      () => {
        const known = Number.isFinite(audio.duration) && audio.duration > 0;
        watchdog.current = window.setTimeout(
          advance,
          known ? audio.duration * 1000 + 600 : MAX_CLIP_MS
        );
      },
      // refused (autoplay policy) or interrupted — move on rather than wedge
      advance
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    const list = cues ?? [];

    /*
     * Prime once, on mount, even with nothing to skip.
     *
     * This used to wait for the first non-empty batch before priming, which
     * meant the opening action of every game was swallowed as "history" — a
     * fresh game mounts with no cues at all, so the first real one looked like
     * the catch-up point. Priming here marks the line rather than the first
     * thing to cross it.
     */
    if (!primed.current) {
      primed.current = true;
      lastPlayed.current = primeFrom(list);
      return;
    }

    const fresh = freshCues(list, lastPlayed.current);
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
