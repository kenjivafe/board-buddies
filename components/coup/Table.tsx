"use client";

import { isAlive } from "@/lib/coup/rules";
import type { CoupView } from "@/lib/coup/view";
import { Coins, InfluencePips } from "./Cards";

/** The public board: who is still in, what they hold, what they have spent. */
export default function Table({ state, highlight }: { state: CoupView; highlight?: string[] }) {
  const turnId = state.players[state.turnIndex]?.id;

  return (
    <section className="table-view" aria-label="The table">
      <ul className="roster">
        {state.players.map((p) => {
          const out = !isAlive(p);
          const marked = highlight?.includes(p.id);
          return (
            <li
              className={`roster-row${out ? " out" : ""}${p.id === turnId && !out ? " acting" : ""}${
                marked ? " marked" : ""
              }`}
              key={p.id}
            >
              <span className="roster-name">{p.name}</span>
              {out ? <span className="out-tag">Out</span> : <Coins n={p.coins} />}
              <InfluencePips cards={p.cards} />
            </li>
          );
        })}
      </ul>
      <p className="court-count">{state.courtCount} cards face down in the court</p>
    </section>
  );
}

export function Feed({ state }: { state: CoupView }) {
  const recent = state.log.slice(-4).reverse();
  return (
    <section className="feed" aria-label="What just happened" aria-live="polite">
      {recent.map((entry, i) => (
        <p className={`feed-line kind-${entry.kind}${i === 0 ? " latest" : ""}`} key={`${i}-${entry.text}`}>
          {entry.text}
        </p>
      ))}
    </section>
  );
}
