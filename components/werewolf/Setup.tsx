"use client";

import { useState } from "react";
import Link from "next/link";
import type { Action } from "@/lib/werewolf/reducer";
import {
  CENTRE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  lineupProblem,
  suggestLineup,
} from "@/lib/werewolf/roles";
import type { OnuwPlayer, Role } from "@/lib/werewolf/types";
import { Moon, Rule } from "./Bits";
import Lineup from "./Lineup";

export default function Setup({
  players: seeded,
  lineup: seededLineup,
  seconds: seededSeconds,
  dispatch,
}: {
  players: OnuwPlayer[];
  lineup: Record<Role, number>;
  seconds: number;
  dispatch: React.Dispatch<Action>;
}) {
  const [players, setPlayers] = useState(seeded.map((p) => ({ id: p.id, name: p.name })));
  const [name, setName] = useState("");
  // the box follows the table until somebody edits it themselves
  const [touched, setTouched] = useState(false);
  const [lineup, setLineup] = useState(seededLineup);
  const [seconds, setSeconds] = useState(seededSeconds);

  const resize = (next: { id: string; name: string }[]) => {
    setPlayers(next);
    if (!touched) setLineup(suggestLineup(next.length));
  };

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || players.length >= MAX_PLAYERS) return;
    resize([...players, { id: crypto.randomUUID(), name: trimmed }]);
    setName("");
  };

  const enough = players.length >= MIN_PLAYERS;
  const problem = lineupProblem(lineup, players.length);

  return (
    <>
      <Link className="back-link" href="/">
        <span aria-hidden>←</span> Board Buddies
      </Link>

      <header className="ww-hero">
        <Moon size={58} phase={0} />
        <span className="ww-kicker">One Night</span>
        <h1 className="title">
          Were<em>wolf</em>
        </h1>
        <p className="ww-sub">
          One night, one vote, no second chances. Your card may not even be yours by morning.
        </p>
      </header>

      <section aria-label="Players">
        <Rule>Round the table</Rule>
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
                onClick={() => resize(players.filter((x) => x.id !== p.id))}
                aria-label={`Remove ${p.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ww-section" aria-label="The box">
        <Rule>What goes in the box</Rule>
        <p className="hint" style={{ textAlign: "left", lineHeight: 1.5 }}>
          One card each, plus {CENTRE} in the middle that nobody is dealt. Those three are
          where half the lies come from.
        </p>
        <Lineup
          players={players.length}
          lineup={lineup}
          onChange={(next) => {
            setTouched(true);
            setLineup(next);
          }}
          seconds={seconds}
          onSeconds={setSeconds}
        />
      </section>

      <footer className="setup-footer">
        <button
          className="btn btn-primary"
          disabled={!enough || Boolean(problem)}
          onClick={() =>
            dispatch({ type: "START", players, lineup, discussionSeconds: seconds })
          }
        >
          Deal
        </button>
        <p className="hint">
          {!enough
            ? `One Night needs at least ${MIN_PLAYERS} at the table.`
            : problem
              ? problem
              : "Everyone looks at their own card, then the night starts."}
        </p>
      </footer>
    </>
  );
}
