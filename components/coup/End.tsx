"use client";

import Link from "next/link";
import type { Action } from "@/lib/coup/reducer";
import { known, type CoupView } from "@/lib/coup/view";
import { isAlive } from "@/lib/coup/rules";
import { CardFace } from "./Cards";

export default function End({
  state,
  dispatch,
}: {
  state: CoupView;
  dispatch: React.Dispatch<Action>;
}) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const survived = known(winner?.cards ?? []).filter((c) => !c.revealed);

  return (
    <>
      <header className="coup-hero">
        <span className="crest" aria-hidden>
          <span style={{ ["--c" as string]: "var(--hot)" }}>★</span>
        </span>
        <h1 className="title">
          {winner ? "Court" : "No one"} <em>{winner ? "taken" : "left"}</em>
        </h1>
        <span className="chevron" aria-hidden />
        <p className="coup-sub">
          {winner ? `${winner.name} holds the last influence.` : "Everyone fell at once."}
        </p>
      </header>

      {survived.length > 0 && (
        <section aria-label="What the winner was holding">
          <span className="eyebrow">What they had all along</span>
          <div className="choose-cards" style={{ marginTop: 10 }}>
            {survived.map((card) => (
              <CardFace key={card.id} character={card.character} />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Final standings">
        <span className="eyebrow">How it ended</span>
        <ul className="standings">
          {state.players.map((p) => (
            <li className={`standing${isAlive(p) ? " alive" : ""}`} key={p.id}>
              <span className="standing-name">{p.name}</span>
              <span className="standing-note">
                {isAlive(p) ? `${p.coins} coins, still standing` : "Out of influence"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="setup-footer">
        <button className="btn btn-primary" onClick={() => dispatch({ type: "RESTART" })}>
          Same court, new deal
        </button>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: "NEW_GAME" })}>
          Change players
        </button>
        <Link className="hint" href="/" style={{ marginTop: 4 }}>
          Pick another game
        </Link>
      </footer>
    </>
  );
}
