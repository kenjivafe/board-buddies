"use client";

import Link from "next/link";
import type { Action } from "@/lib/coup/reducer";
import { known, type CoupView } from "@/lib/coup/view";
import { isAlive } from "@/lib/coup/rules";
import { CardFace } from "./Cards";
import { CHARACTER_INFO } from "@/lib/coup/deck";

export default function End({
  state,
  dispatch,
}: {
  state: CoupView;
  dispatch: React.Dispatch<Action>;
}) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const survived = known(winner?.cards ?? []).filter((c) => !c.revealed);
  /*
   * What won it, for the line underneath. The card itself needs no special
   * handling any more: a claim proved on the winning action is handed back
   * rather than swapped for a card nobody will ever play, so the hand here is
   * simply the hand. This used to draw the proven character over the top of
   * the replacement, which made this section disagree with the standings
   * below it about what the winner was holding.
   */
  const proved = [...state.beats].reverse().find(
    (b): b is typeof b & { character: NonNullable<typeof b.character> } =>
      b.kind === "proven" && b.character !== null && b.who === winner?.name
  );

  // the blow that ended it, from the story of the last action
  const lastFallen = [...state.beats].reverse().find(
    (b): b is typeof b & { character: NonNullable<typeof b.character> } =>
      b.kind === "surrender" && b.character !== null
  );

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
        <section aria-label={`What ${winner?.name} is holding`}>
          <span className="eyebrow">Still standing · {winner?.name}</span>
          <div className="choose-cards" style={{ marginTop: 10 }}>
            {survived.map((card) => (
              // every card named, not just one of them — a named card beside an
              // unnamed one read as though only the named one mattered
              <CardFace key={card.id} character={card.character} caption />
            ))}
          </div>
          {proved && (
            <p className="hint" style={{ marginTop: 8 }}>
              Won it proving the {CHARACTER_INFO[proved.character].name}.
            </p>
          )}
        </section>
      )}

      {lastFallen && (
        <section aria-label="The final influence lost" style={{ marginTop: 22 }}>
          <span className="eyebrow">
            The last card to fall{lastFallen.who ? ` · ${lastFallen.who}` : ""}
          </span>
          <div className="choose-cards" style={{ marginTop: 10 }}>
            <CardFace character={lastFallen.character} spent caption />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {lastFallen.text}
          </p>
        </section>
      )}

      {/*
        Everybody's hand, not just the winner's. A player who is out has both
        influences face up already, so this gives nothing away — and it is the
        first chance the table gets to see who was bluffing about what all game,
        which was previously hidden behind a line of text saying "out".
      */}
      <section aria-label="Final standings" style={{ marginTop: 22 }}>
        <span className="eyebrow">How it ended</span>
        <ul className="standings">
          {state.players.map((p) => {
            const cards = known(p.cards);
            return (
              <li className={`standing${isAlive(p) ? " alive" : ""}`} key={p.id}>
                <span className="standing-head">
                  <span className="standing-name">{p.name}</span>
                  <span className="standing-note">
                    {isAlive(p) ? `${p.coins} coins, still standing` : "Out of influence"}
                  </span>
                </span>
                {cards.length > 0 && (
                  <span className="standing-cards">
                    {cards.map((card) => (
                      <CardFace
                        key={card.id}
                        character={card.character}
                        spent={card.revealed}
                        sizes="64px"
                      />
                    ))}
                  </span>
                )}
              </li>
            );
          })}
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
