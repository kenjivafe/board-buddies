"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CHARACTER_INFO, CHARACTERS } from "@/lib/coup/deck";
import { CARD_W, CARD_H } from "./Cards";
import type { Action } from "@/lib/coup/reducer";
import type { CoupPlayer } from "@/lib/coup/types";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

export default function Setup({
  players: seeded,
  dispatch,
}: {
  players: CoupPlayer[];
  dispatch: React.Dispatch<Action>;
}) {
  const [players, setPlayers] = useState(seeded.map((p) => ({ id: p.id, name: p.name })));
  const [name, setName] = useState("");

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || players.length >= MAX_PLAYERS) return;
    setPlayers([...players, { id: crypto.randomUUID(), name: trimmed }]);
    setName("");
  };

  const remove = (id: string) => setPlayers(players.filter((p) => p.id !== id));

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= players.length) return;
    const next = [...players];
    [next[i], next[j]] = [next[j], next[i]];
    setPlayers(next);
  };

  const canStart = players.length >= MIN_PLAYERS;

  return (
    <>
      <Link className="back-link" href="/">
        <span aria-hidden>←</span> Board Buddies
      </Link>

      <header className="coup-hero">
        {/* the deck at a glance — one sigil per character, in its own ink */}
        <span className="crest" aria-hidden>
          {CHARACTERS.map((c) => (
            <span key={c} style={{ ["--c" as string]: `var(--${c})` }}>
              {CHARACTER_INFO[c].glyph}
            </span>
          ))}
        </span>
        <h1 className="title">
          Cou<em>p</em>
        </h1>
        <span className="chevron" aria-hidden />
        <p className="coup-sub">
          Two influences each. Lie about both. Last one standing runs the court.
        </p>
      </header>

      <section aria-label="Players">
        <span className="eyebrow">At court</span>
        <div className="field-row">
          <input
            className="text-input"
            placeholder="Player name"
            value={name}
            maxLength={18}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            aria-label="Player name"
          />
          <button
            className="btn btn-primary"
            onClick={add}
            disabled={!name.trim() || players.length >= MAX_PLAYERS}
          >
            Add
          </button>
        </div>

        <ul className="player-list">
          {players.map((p, i) => (
            <li className="player-row" key={p.id}>
              <span className="seat">{i + 1}</span>
              <span className="name">{p.name}</span>
              <button
                className="icon-btn"
                onClick={() => move(i, -1)}
                aria-label={`Move ${p.name} up`}
                disabled={i === 0}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                onClick={() => move(i, 1)}
                aria-label={`Move ${p.name} down`}
                disabled={i === players.length - 1}
              >
                ↓
              </button>
              <button className="icon-btn" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="court-key" aria-label="The court">
        <span className="eyebrow">The court · 3 of each</span>
        <ul className="key-list">
          {CHARACTERS.map((c) => {
            const info = CHARACTER_INFO[c];
            return (
              <li className="key-row" key={c} style={{ ["--c" as string]: `var(--${c})` }}>
                <span className="key-thumb">
                  <Image
                    src={`/coup/${c}.png`}
                    alt=""
                    width={CARD_W}
                    height={CARD_H}
                    sizes="48px"
                  />
                </span>
                <span className="key-body">
                  <span className="key-name">{info.name}</span>
                  <span className="key-power">{info.power}</span>
                  <span className="key-counter">{info.counter}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="setup-footer">
        <button
          className="btn btn-primary"
          disabled={!canStart}
          onClick={() => dispatch({ type: "START", players })}
        >
          Deal the court
        </button>
        <p className="hint">
          {canStart
            ? "Everyone peeks at their hand, then play begins."
            : `Add at least ${MIN_PLAYERS} players to start.`}
        </p>
      </footer>
    </>
  );
}
