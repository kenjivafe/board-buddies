"use client";

import { useEffect, useReducer, useState } from "react";
import { initialState, reducer, STORAGE_KEY } from "@/lib/kings-cup/reducer";
import type { GameState } from "@/lib/kings-cup/types";
import Setup from "./Setup";
import Play from "./Play";
import End from "./End";
import { Sheet } from "./Sheets";

export default function Game() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [resume, setResume] = useState<GameState | null>(null);

  // load saved game once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as GameState;
        if (saved.phase === "playing" && saved.players.length >= 2) {
          setResume(saved);
        } else if (saved.players.length >= 2) {
          // keep the roster for a quick next game
          dispatch({ type: "HYDRATE", state: { ...initialState(), players: saved.players, kingMode: saved.kingMode } });
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

  if (!hydrated) return <main className="shell" />;

  return (
    <main className="shell">
      {state.phase === "setup" && <Setup state={state} dispatch={dispatch} />}
      {state.phase === "playing" && <Play state={state} dispatch={dispatch} />}
      {state.phase === "ended" && <End state={state} dispatch={dispatch} />}

      {resume && (
        <Sheet title="Game in progress" sub={`${resume.players.length} players · ${resume.deck.length} cards left`}>
          <p className="confirm-text">
            Pick up where you left off, or deal a fresh deck?
          </p>
          <div className="sheet-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setResume(null)}
            >
              Start over
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                dispatch({ type: "HYDRATE", state: resume });
                setResume(null);
              }}
            >
              Resume game
            </button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
