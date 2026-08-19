"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { fileFor } from "@/lib/werewolf/voice";
import {
  BED,
  DUCK,
  FADE_MS,
  HOWL,
  HOWL_GAP,
  ROOSTER,
  STING_GAIN,
  stingFile,
  takeOf,
} from "@/lib/werewolf/ambience";
import type { NightStep } from "@/lib/werewolf/types";

const MUTE_KEY = "werewolf:voice-muted";
/** a breath between lines, so a run of them does not trample itself */
const GAP_MS = 260;
/** fallback when a clip duration is unknown, so the queue cannot wedge */
const MAX_CLIP_MS = 9000;

/**
 * One thing to do in order: read a line, play a role's sound, wait, or run a
 * callback once everything before it has actually finished.
 */
export type Cue =
  | { line: string }
  | { sting: NightStep }
  | { pause: number }
  | { then: () => void };

export interface Narrator {
  /**
   * Read a run of the script, waiting for each clip to end before starting the
   * next. This is the only way to make a sound, on purpose: there used to be a
   * one-shot `say` beside it, and two things that could both start audio meant
   * the script could talk over itself the moment the game moved quicker than
   * the voice — which is exactly what a fast table, or a role nobody was dealt,
   * makes it do.
   */
  enqueue: (cues: Cue[]) => void;
  /** Put the wood under the night, or take it away and crow in the morning. */
  setScene: (scene: "night" | "day" | "off") => void;
  /**
   * True while there is still script to get through. A room reads this to hold
   * a role's screen back until it has actually been called: without it a quick
   * player answers a prompt that appeared the instant the state moved, the next
   * call queues up behind a line still being read, and by the middle of the
   * night the voice is a role or two behind the game.
   */
  speaking: boolean;
  muted: boolean;
  toggle: () => void;
  /** false in a room, where there is no shared moderator to listen to */
  present: boolean;
}

const SILENT: Narrator = {
  // a callback still has to run when nobody is listening, or a muted table
  // would never get past a role that wakes nobody
  enqueue: (cues) => {
    for (const c of cues) if ("then" in c) c.then();
  },
  setScene: () => {},
  speaking: false,
  muted: true,
  toggle: () => {},
  present: false,
};

const Ctx = createContext<Narrator>(SILENT);

/**
 * The moderator's voice, for one phone only.
 *
 * A room has no shared speaker: every device would read the script at once,
 * over each other, and half of it would be calling roles that particular phone
 * is not allowed to know about. So rooms simply never mount this, and
 * `useNarrator` hands them a narrator that says nothing — which means the night
 * screens can call `say()` unconditionally without caring which mode they're in.
 */
export function NarratorProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMuted] = useState(false);
  /** whatever the queue is playing right now, so muting can cut it off */
  const audio = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(MUTE_KEY) === "on";
    } catch {
      // some privacy modes throw on access rather than returning null, and a
      // provider that dies here takes the whole game down with it
    }
    setMuted(saved);
    mutedRef.current = saved;
  }, []);

  // ---------- the wood, under all of it ----------

  const bed = useRef<HTMLAudioElement | null>(null);
  const ducked = useRef(false);
  const fading = useRef<number | undefined>(undefined);
  const howlTimer = useRef<number | undefined>(undefined);

  /** Slide the bed to a level over FADE_MS, and stop it if that level is zero. */
  const fadeTo = useCallback((target: number, ms = FADE_MS) => {
    const el = bed.current;
    if (!el) return;
    window.clearInterval(fading.current);
    const from = el.volume;
    const started = Date.now();
    fading.current = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / ms);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t < 1) return;
      window.clearInterval(fading.current);
      if (target === 0) {
        el.pause();
        el.currentTime = 0;
      }
    }, 50);
  }, []);

  const level = () => (ducked.current ? BED.gain * DUCK : BED.gain);

  const duck = useCallback(
    (on: boolean) => {
      if (ducked.current === on) return;
      ducked.current = on;
      if (bed.current && !bed.current.paused) fadeTo(level(), 450);
    },
    [fadeTo]
  );

  /** One howl, somewhere out there, then another after a while. */
  const scheduleHowl = useCallback(() => {
    window.clearTimeout(howlTimer.current);
    const [lo, hi] = HOWL_GAP;
    howlTimer.current = window.setTimeout(
      () => {
        if (!mutedRef.current && bed.current && !bed.current.paused) {
          const howl = new Audio(takeOf(HOWL));
          howl.volume = HOWL.gain;
          void howl.play().catch(() => {});
        }
        scheduleHowl();
      },
      lo + Math.random() * (hi - lo)
    );
  }, []);

  // ---------- the script, one thing at a time ----------

  const queue = useRef<Cue[]>([]);
  const reading = useRef(false);
  const [speaking, setSpeaking] = useState(false);

  /**
   * Plays one clip and calls back when it has actually finished.
   *
   * Media events are best-effort, so every route out has to reach `done`
   * exactly once: a clip that ends, a file that is missing, a play() the
   * browser refuses, and a watchdog behind all three. Coup's voice queue
   * learnt this the hard way — one missed event and the rest of the script
   * sits there forever.
   */
  const playOnce = useCallback((src: string, volume: number, done: () => void) => {
    const el = new Audio(src);
    el.volume = volume;
    audio.current = el;
    let moved = false;
    let watchdog = 0;
    const finish = () => {
      if (moved) return;
      moved = true;
      window.clearTimeout(watchdog);
      done();
    };
    el.onended = finish;
    el.onerror = finish;
    void el.play().then(
      () => {
        const known = Number.isFinite(el.duration) && el.duration > 0;
        watchdog = window.setTimeout(finish, known ? el.duration * 1000 + 600 : MAX_CLIP_MS);
      },
      finish
    );
  }, []);

  const drain = useCallback(() => {
    if (reading.current) return;
    const cue = queue.current.shift();
    if (!cue) {
      setSpeaking(false);
      return;
    }
    reading.current = true;
    const next = () => {
      reading.current = false;
      drain();
    };

    if ("then" in cue) {
      cue.then();
      next();
      return;
    }
    if ("pause" in cue) {
      window.setTimeout(next, cue.pause);
      return;
    }
    if (mutedRef.current) {
      // muted still has to take its time, or a silent table races the game
      window.setTimeout(next, "sting" in cue ? 400 : 1200);
      return;
    }
    if ("sting" in cue) {
      duck(true);
      playOnce(stingFile(cue.sting), STING_GAIN, next);
      return;
    }
    const src = fileFor(cue.line);
    if (!src) {
      next();
      return;
    }
    duck(true);
    playOnce(src, 1, () => {
      duck(false);
      window.setTimeout(next, GAP_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playOnce]);

  const enqueue = useCallback(
    (cues: Cue[]) => {
      if (cues.length === 0) return;
      queue.current = [...queue.current, ...cues];
      setSpeaking(true);
      drain();
    },
    [drain]
  );

  const setScene = useCallback(
    (scene: "night" | "day" | "off") => {
      if (scene === "night") {
        if (mutedRef.current) return;
        const el = bed.current ?? new Audio(takeOf(BED));
        bed.current = el;
        el.loop = true;
        if (el.paused) {
          el.volume = 0;
          void el.play().then(
            () => fadeTo(level()),
            // autoplay refused, or no file cut yet — the night is just quiet
            () => {}
          );
        }
        scheduleHowl();
        return;
      }

      window.clearTimeout(howlTimer.current);
      if (scene === "day" && !mutedRef.current) {
        const bird = new Audio(takeOf(ROOSTER));
        bird.volume = ROOSTER.gain;
        void bird.play().catch(() => {});
      }
      // morning cuts the wood off rather than letting it run under the argument
      fadeTo(0, scene === "day" ? 900 : 300);
    },
    [fadeTo, scheduleHowl]
  );

  const toggle = useCallback(() => {
    setMuted((was) => {
      const next = !was;
      mutedRef.current = next;
      try {
        localStorage.setItem(MUTE_KEY, next ? "on" : "off");
      } catch {
        /* private browsing — the choice just won't stick */
      }
      if (next) {
        // cut the line short, but leave the queue alone: its callbacks are what
        // move the night along, and dropping them would strand the table
        audio.current?.pause();
        window.clearTimeout(howlTimer.current);
        fadeTo(0, 300);
      }
      return next;
    });
  }, [fadeTo]);

  // nothing should outlive the game it belongs to
  useEffect(
    () => () => {
      audio.current?.pause();
      bed.current?.pause();
      window.clearTimeout(howlTimer.current);
      window.clearInterval(fading.current);
    },
    []
  );

  return (
    <Ctx.Provider value={{ enqueue, setScene, speaking, muted, toggle, present: true }}>
      {children}
    </Ctx.Provider>
  );
}

export const useNarrator = (): Narrator => useContext(Ctx);

/**
 * Puts the wood under the night and takes it away in the morning.
 *
 * Driven off the phase rather than off any one screen, so the bed survives the
 * pass gates, the panels and the beats in between — it should be the one thing
 * that doesn't stop when the phone changes hands.
 */
export function useScene(scene: "night" | "day" | "off") {
  const { setScene } = useNarrator();
  useEffect(() => {
    setScene(scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
}

/** The one control the table needs, parked out of the way. */
export function MuteButton({ inBar }: { inBar?: boolean }) {
  const { muted, toggle, present } = useNarrator();
  if (!present) return null;
  return (
    <button
      className={inBar ? "bar-btn" : "mute-btn"}
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? "Turn the narrator on" : "Turn the narrator off"}
      title={muted ? "Narrator off" : "Narrator on"}
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
