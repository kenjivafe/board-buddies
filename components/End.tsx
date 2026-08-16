"use client";

import type { Action } from "@/lib/reducer";
import type { GameState } from "@/lib/types";

export default function End({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const ranked = [...state.players].sort(
    (a, b) => (state.drinkTally[b.id] ?? 0) - (state.drinkTally[a.id] ?? 0)
  );
  const max = Math.max(1, ...ranked.map((p) => state.drinkTally[p.id] ?? 0));
  const kingsCupDrinker =
    state.kingMode === "cup" && state.kingsDrawn >= 4
      ? [...state.drawn].reverse().find((d) => d.card.rank === 13)
      : null;

  return (
    <>
      <header className="end-hero">
        <span className="crown" style={{ fontSize: 30, color: "var(--gold)", display: "block", marginBottom: 10 }} aria-hidden>
          {"\u2654"}
        </span>
        <h1 className="title">
          Deck <em>done</em>
        </h1>
        <p className="setup-sub">
          {kingsCupDrinker
            ? `${state.players.find((p) => p.id === kingsCupDrinker.playerId)?.name} drank the King's Cup.`
            : "All 52 cards drawn."}
        </p>
      </header>

      <section aria-label="Drink tally">
        <span className="eyebrow">Assigned drinks</span>
        <div className="stats">
          {ranked.map((p, i) => {
            const n = state.drinkTally[p.id] ?? 0;
            return (
              <div className="stat-row" key={p.id}>
                <span className="rank-n">{i + 1}</span>
                <span style={{ flex: 1 }}>
                  <span className="name" style={{ display: "block" }}>
                    {p.name}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                </span>
                <span className="val">
                  {n} {n === 1 ? "drink" : "drinks"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Counts cards that name a drinker (2–5, 4th King, mates). Hell, Heaven and the games settle their own scores.
        </p>
      </section>

      <footer className="setup-footer">
        <button className="btn btn-gold draw-btn" onClick={() => dispatch({ type: "RESTART" })}>
          Same table, new deck
        </button>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: "NEW_GAME" })}>
          Change players
        </button>
      </footer>
    </>
  );
}
