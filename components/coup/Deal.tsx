"use client";

import type { Action } from "@/lib/coup/reducer";
import { known, type CoupView } from "@/lib/coup/view";
import { PassGate, PeekHand } from "./PassGate";

/** One player at a time learns their hand, then hands the phone on. */
export default function Deal({
  state,
  dispatch,
}: {
  state: CoupView;
  dispatch: React.Dispatch<Action>;
}) {
  const player = state.players[state.dealIndex];
  const last = state.dealIndex === state.players.length - 1;

  return (
    <>
      <header className="deal-head">
        <span className="eyebrow">
          Dealing · {state.dealIndex + 1} of {state.players.length}
        </span>
      </header>

      <PassGate
        key={player.id}
        name={player.name}
        note="Two influences, face down. Learn them and keep them to yourself."
      >
        <section className="deal-body">
          <h2 className="deal-name">{player.name}</h2>
          <PeekHand cards={known(player.cards)} />
          <button className="btn btn-primary" onClick={() => dispatch({ type: "DEAL_NEXT" })}>
            {last ? "Everyone's seen theirs — begin" : "Got it, pass on"}
          </button>
        </section>
      </PassGate>
    </>
  );
}
