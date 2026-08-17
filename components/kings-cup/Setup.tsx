"use client";

import { useState } from "react";
import Link from "next/link";
import type { Action } from "@/lib/kings-cup/reducer";
import type { GameState, KingMode, Player } from "@/lib/kings-cup/types";

const MAX_PLAYERS = 12;

export default function Setup({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const [players, setPlayers] = useState<Player[]>(state.players);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<KingMode>(state.kingMode);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || players.length >= MAX_PLAYERS) return;
    setPlayers([...players, { id: crypto.randomUUID(), name: trimmed }]);
    setName("");
  };

  const remove = (id: string) => setPlayers(players.filter((p) => p.id !== id));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= players.length) return;
    const next = [...players];
    [next[i], next[j]] = [next[j], next[i]];
    setPlayers(next);
  };

  const canStart = players.length >= 2;

  return (
    <>
      <Link className="back-link" href="/">
        <span aria-hidden>←</span> Board Buddies
      </Link>

      <header className="setup-hero">
        <span className="crown" aria-hidden>
          {"\u2654"}
        </span>
        <h1 className="title">
          King&apos;s <em>Cup</em>
        </h1>
        <p className="setup-sub">Seat everyone in table order, left to right.</p>
      </header>

      <section aria-label="Players">
        <span className="eyebrow">Around the table</span>
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
          <button className="btn btn-primary" onClick={add} disabled={!name.trim() || players.length >= MAX_PLAYERS}>
            Add
          </button>
        </div>

        <ul className="player-list">
          {players.map((p, i) => (
            <li className="player-row" key={p.id}>
              <span className="seat">{i + 1}</span>
              <span className="name">{p.name}</span>
              <button className="icon-btn" onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`} disabled={i === 0}>
                {"\u2191"}
              </button>
              <button className="icon-btn" onClick={() => move(i, 1)} aria-label={`Move ${p.name} down`} disabled={i === players.length - 1}>
                {"\u2193"}
              </button>
              <button className="icon-btn" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>
                {"\u2715"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="king-mode" aria-label="King mode">
        <span className="eyebrow">When a King is drawn</span>
        <div className="mode-toggle">
          <button className="mode-card" aria-pressed={mode === "cup"} onClick={() => setMode("cup")}>
            <h3>King&apos;s Cup</h3>
            <p>First three Kings pour into the cup. The fourth drinks it all.</p>
          </button>
          <button className="mode-card" aria-pressed={mode === "rule"} onClick={() => setMode("rule")}>
            <h3>King&apos;s Rule</h3>
            <p>Make any rule. Break it, drink. A new King replaces it.</p>
          </button>
        </div>
      </section>

      <footer className="setup-footer">
        <button
          className="btn btn-primary draw-btn"
          disabled={!canStart}
          onClick={() => dispatch({ type: "START", players, kingMode: mode })}
        >
          Deal the deck
        </button>
        <p className="hint">
          {canStart ? "52 cards, shuffled. Drink responsibly." : "Add at least 2 players to start."}
        </p>
      </footer>
    </>
  );
}
