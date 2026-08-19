"use client";

import { useState } from "react";
import Link from "next/link";
import type { Action } from "@/lib/werewolf/reducer";
import { MuteButton } from "./useNarrator";

/**
 * The two controls that have to be reachable at any point in a game on one
 * phone: the narrator's mute, and a way out.
 *
 * Once the cards were dealt there was no exit at all — the only route back to
 * the hub was to finish the night, hold the vote and read the result. Coup and
 * King's Cup both grew the same escape hatch; this is Werewolf's.
 */
export default function GameBar({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <div className="game-bar">
        <MuteButton inBar />
        <button className="bar-btn" onClick={() => setLeaving(true)}>
          Leave
        </button>
      </div>

      {leaving && (
        <div className="sheet-scrim" role="dialog" aria-modal aria-label="Leave this game">
          <div className="sheet-card">
            <span className="eyebrow">Leave this game</span>
            <p className="gate-note">
              The night is saved as you go, so this one is still here when you come back.
            </p>
            <button className="btn btn-primary" onClick={() => setLeaving(false)}>
              Keep playing
            </button>
            <Link className="btn btn-ghost" href="/" style={{ textAlign: "center" }}>
              Back to Board Buddies
            </Link>
            <button
              className="btn btn-danger"
              onClick={() => {
                dispatch({ type: "NEW_GAME" });
                setLeaving(false);
              }}
            >
              End it and change the box
            </button>
          </div>
        </div>
      )}
    </>
  );
}
