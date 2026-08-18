"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { initialState, reducer, STORAGE_KEY } from "@/lib/coup/reducer";
import type { CoupState, Phase } from "@/lib/coup/types";
import { ALL_SEEING, viewFor } from "@/lib/coup/view";
import Setup from "./Setup";
import Deal from "./Deal";
import Play from "./Play";
import End from "./End";
import { useVoice } from "./useVoice";

const LIVE_PHASES: Phase[] = ["deal", "turn", "reaction", "block", "showdown", "reveal", "exchange"];

/** Phases that Play renders — derived, so adding one can't silently blank the screen. */
const IN_PLAY: Phase[] = LIVE_PHASES.filter((p) => p !== "deal");

export default function Game() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [resume, setResume] = useState<CoupState | null>(null);

  // load saved game once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as CoupState;
        if (LIVE_PHASES.includes(saved.phase) && saved.players.length >= 2) {
          setResume(saved);
        } else if (saved.players.length >= 2) {
          // keep the roster for a quick next game
          dispatch({
            type: "HYDRATE",
            state: { ...initialState(), players: saved.players.map((p) => ({ ...p, cards: [] })) },
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
      /* storage full or unavailable — game continues in memory */
    }
  }, [state, hydrated]);

  // one device, so this holder is entitled to the whole game — the pass gates,
  // not the payload, are what keep hands private here
  const view = useMemo(() => viewFor(state, ALL_SEEING), [state]);
  // above the phase switch, so the final influence still gets to speak
  const voice = useVoice(view.cues);

  if (!hydrated) return <main className="shell" />;

  if (resume) {
    return (
      <main className="shell">
        <section className="gate">
          <span className="eyebrow">Game in progress</span>
          <h2 className="gate-name">{resume.players.length} at court</h2>
          <p className="gate-note">
            Pick up where you left off, or deal a fresh court? Hands are remembered.
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
      {state.phase === "setup" && <Setup players={state.players} dispatch={dispatch} />}
      {state.phase === "deal" && <Deal state={view} dispatch={dispatch} />}
      {state.phase === "ended" && <End state={view} dispatch={dispatch} />}
      {/* Everything else is a phase of live play. Listing them instead meant a
          new phase rendered a blank screen until someone noticed. */}
      {!IN_PLAY.includes(state.phase) ? null : (
        <Play state={view} dispatch={dispatch} canUndo={state.past.length > 0} voice={voice} />
      )}
    </main>
  );
}
