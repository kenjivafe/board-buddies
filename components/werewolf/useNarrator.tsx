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

export interface Narrator {
  /** Say a line. Cuts off whatever was being said — the script never overlaps. */
  say: (stem: string | null) => void;
  /** Stop talking, without changing the mute setting. */
  hush: () => void;
  /** Put the wood under the night, or take it away and crow in the morning. */
  setScene: (scene: "night" | "day" | "off") => void;
  /** The sound a role arrives on, played before it is called by name. */
  sting: (step: NightStep) => void;
  muted: boolean;
  toggle: () => void;
  /** false in a room, where there is no shared moderator to listen to */
  present: boolean;
}

const SILENT: Narrator = {
  say: () => {},
  hush: () => {},
  setScene: () => {},
  sting: () => {},
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

  const hush = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    el.pause();
    // a paused element resumes where it stopped; the script never wants that
    el.currentTime = 0;
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

  /**
   * The sound a role arrives on. Its own element, so it rings on underneath
   * the line that follows it rather than being cut off by it.
   */
  const sting = useCallback((step: NightStep) => {
    if (mutedRef.current) return;
    const clip = new Audio(stingFile(step));
    clip.volume = STING_GAIN;
    void clip.play().catch(() => {});
  }, []);

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

  const say = useCallback(
    (stem: string | null) => {
      if (mutedRef.current || !stem) return;
      const src = fileFor(stem);
      if (!src) return;

      const el = audio.current ?? new Audio();
      audio.current = el;
      el.pause();
      el.src = src;
      // the wood drops back while the moderator is talking, and comes up again
      // when the line ends — or when it doesn't, because the file is missing
      duck(true);
      el.onended = () => duck(false);
      el.onerror = () => duck(false);
      // a missing file is silence by design — the lines are generated
      // separately, and the game has to work before anybody has run the script
      void el.play().catch(() => duck(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
        audio.current?.pause();
        if (audio.current) audio.current.currentTime = 0;
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
    <Ctx.Provider value={{ say, hush, setScene, sting, muted, toggle, present: true }}>
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

/**
 * Says a line once, when it appears. Written as a hook because every place the
 * script speaks is "this screen has this line".
 *
 * Deliberately does NOT stop on the way out. A moderator finishes the sentence
 * while the phone is being handed over; cutting the line the instant somebody
 * taps meant "Everyone... wake up" was clipped to nothing, and every call was
 * losing its second half. Overlap is not a risk, because `say` stops whatever
 * is playing before it starts the next line.
 */
export function useLine(stem: string | null) {
  const { say } = useNarrator();
  useEffect(() => {
    say(stem);
    // keyed on the stem alone: the same line should not be said twice because
    // something else on the screen re-rendered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stem]);
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
