"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { initialState, reducer, STORAGE_KEY } from "@/lib/werewolf/reducer";
import { MIN_PLAYERS, suggestLineup } from "@/lib/werewolf/roles";
import type { OnuwState, Phase } from "@/lib/werewolf/types";
import { ALL_SEEING, viewFor } from "@/lib/werewolf/view";
import { Sky } from "./Bits";
import Day from "./Day";
import Deal from "./Deal";
import End from "./End";
import Night from "./Night";
import Setup from "./Setup";
import GameBar from "./GameBar";
import { NarratorProvider, useScene } from "./useNarrator";

const LIVE_PHASES: Phase[] = ["deal", "night", "day", "vote"];

/**
 * Sits inside the provider purely so it can call the hook. The wood comes up
 * when the night actually falls — not during the deal, which happens with
 * everyone awake and looking at their own card — and runs until the dawn beat
 * is dismissed, which is when the cockerel goes.
 */
function Scene({ phase, dawning }: { phase: Phase; dawning: boolean }) {
  useScene(
    phase === "night" || dawning
      ? "night"
      : phase === "day" || phase === "vote"
        ? "day"
        : "off"
  );
  return null;
}

/** Night, day, or the red one — the sky is the only thing that tracks this. */
export function skyFor(view: { phase: Phase; outcome: { teams: string[] } | null }) {
  if (view.phase === "night" || view.phase === "deal") return "night" as const;
  if (view.phase === "ended" && view.outcome?.teams.includes("werewolf")) return "dead" as const;
  return "day" as const;
}

/** One Night on one phone: the app is the moderator, and the gates are the night. */
export default function Game() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [resume, setResume] = useState<OnuwState | null>(null);

  // load a saved game once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as OnuwState;
        if (LIVE_PHASES.includes(saved.phase) && saved.players.length >= MIN_PLAYERS) {
          setResume(saved);
        } else if (saved.players.length > 0) {
          // keep the roster and the box for a quick next game
          dispatch({
            type: "HYDRATE",
            state: {
              ...initialState(),
              players: saved.players,
              lineup: saved.lineup,
              discussionSeconds: saved.discussionSeconds,
            },
          });
        }
      }
    } catch {
      /* corrupted save — start fresh */
    }
    setHydrated(true);
  }, []);

  // persist on every change
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable — the game continues in memory */
    }
  }, [state, hydrated]);

  // one device, so this holder is entitled to the whole table — the pass gates,
  // not the payload, are what keep cards private here
  const view = useMemo(() => viewFor(state, ALL_SEEING), [state]);

  // the closing beat of the night, which runs after the phase has turned
  const [dawnSeen, setDawnSeen] = useState(false);
  useEffect(() => {
    if (state.phase === "setup" || state.phase === "deal") setDawnSeen(false);
  }, [state.phase]);
  const dawning = state.phase === "day" && !dawnSeen;

  if (!hydrated) return <main className="shell" />;

  if (resume) {
    return (
      <main className="shell">
        <Sky time="night" />
        <section className="gate">
          <span className="eyebrow">Game in progress</span>
          <h2 className="gate-name">{resume.players.length} at the table</h2>
          <p className="gate-note">
            Pick up where you left off, or deal a fresh night? The box is remembered either way.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              dispatch({ type: "HYDRATE", state: resume });
              setResume(null);
            }}
          >
            Resume game
          </button>
          <button className="btn btn-ghost" onClick={() => setResume(null)}>
            Start over
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <Sky time={skyFor(view)} />
      {/* the moderator speaks only here: a room has no shared speaker to use */}
      <NarratorProvider>
      <Scene phase={state.phase} dawning={dawning} />
      {/* reachable at every point of a live game, which previously had no exit */}
      {state.phase !== "setup" && state.phase !== "ended" && <GameBar dispatch={dispatch} />}
      {state.phase === "setup" && (
        <Setup
          players={state.players}
          lineup={
            state.players.length > 0 && state.lineup.werewolf > 0
              ? state.lineup
              : suggestLineup(state.players.length)
          }
          seconds={state.discussionSeconds}
          dispatch={dispatch}
        />
      )}
      {state.phase === "deal" && <Deal view={view} dispatch={dispatch} />}
      {/* The night owes two more lines after its last role acts — one to send
          them to bed and one to wake the table — so it stays on screen past
          the phase change until that beat has been dismissed. */}
      {(state.phase === "night" || dawning) && (
        <Night view={view} dispatch={dispatch} onDawn={() => setDawnSeen(true)} />
      )}
      {(state.phase === "day" || state.phase === "vote") && !dawning && (
        <Day view={view} dispatch={dispatch} canControl />
      )}
      {state.phase === "ended" && <End view={view} dispatch={dispatch} canControl />}
      </NarratorProvider>
    </main>
  );
}
