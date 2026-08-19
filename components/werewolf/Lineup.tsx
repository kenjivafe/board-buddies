"use client";

import { CENTRE, ROLES, ROLE_INFO, lineupProblem, total } from "@/lib/werewolf/roles";
import type { Role } from "@/lib/werewolf/types";
import { CardFace, tint } from "./Bits";

const CLOCKS = [0, 180, 300, 480];

const clockLabel = (s: number) => (s === 0 ? "No clock" : `${Math.round(s / 60)} min`);

/**
 * The box builder, shared by the one-phone setup screen and the room lobby.
 *
 * One Night always deals three cards to the middle, so the box has to hold
 * exactly three more cards than there are people — the counter is the whole
 * interaction, and it is never allowed to go quiet about being wrong.
 */
export default function Lineup({
  players,
  lineup,
  onChange,
  seconds,
  onSeconds,
}: {
  players: number;
  lineup: Record<Role, number>;
  onChange: (next: Record<Role, number>) => void;
  seconds: number;
  onSeconds: (next: number) => void;
}) {
  const wanted = players + CENTRE;
  const dealt = total(lineup);
  const problem = lineupProblem(lineup, players);

  // the Masons only ever go in as a pair, so they move two at a time
  const stepFor = (role: Role) => (role === "mason" ? 2 : 1);

  const set = (role: Role, value: number) =>
    onChange({ ...lineup, [role]: Math.max(0, Math.min(ROLE_INFO[role].copies, value)) });

  return (
    <>
      <ul className="lineup">
        {ROLES.map((role) => {
          const info = ROLE_INFO[role];
          const n = lineup[role] ?? 0;
          const step = stepFor(role);
          return (
            <li
              className={`lineup-row${n > 0 ? " on" : ""}`}
              key={role}
              style={{ ["--c" as string]: tint(role) }}
            >
              <CardFace role={role} size="xs" />
              <span className="lineup-body">
                <span className="lineup-name">
                  {info.name}
                  {info.copies > 1 && <span className="key-count"> · {info.copies} in the box</span>}
                </span>
                <span className="lineup-blurb">{info.blurb}</span>
              </span>
              <span className="stepper">
                <button
                  className="icon-btn"
                  onClick={() => set(role, n - step)}
                  disabled={n <= 0}
                  aria-label={`One fewer ${info.name}`}
                >
                  −
                </button>
                <output aria-label={`${n} ${info.name}`}>{n}</output>
                <button
                  className="icon-btn"
                  onClick={() => set(role, n + step)}
                  disabled={n + step > info.copies || dealt >= wanted}
                  aria-label={`One more ${info.name}`}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className={`lineup-count${problem ? " bad" : ""}`}>
        <span>
          {problem ??
            `${dealt} cards for ${players} players — one each, three in the middle. Ready.`}
        </span>
        <strong>
          {dealt}/{wanted}
        </strong>
      </div>

      <div className="ww-section">
        <span className="eyebrow">How long is the argument?</span>
        <div className="clock-row" role="group" aria-label="Discussion length">
          {CLOCKS.map((s) => (
            <button
              key={s}
              aria-pressed={seconds === s}
              onClick={() => onSeconds(s)}
            >
              {clockLabel(s)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
