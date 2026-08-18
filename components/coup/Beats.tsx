"use client";

import { CHARACTER_INFO } from "@/lib/coup/deck";
import type { Beat } from "@/lib/coup/types";
import { CardFace } from "./Cards";

/**
 * The story of the action on the table: who blocked, who called it, whether the
 * claim held, and which influence was handed over.
 *
 * A challenge resolves in one step internally, which left the table with no
 * moment to actually see the card. Beats that turned a card face up show it
 * here, and say where it went — back into the court if it was proven, or out
 * of the game if it was surrendered.
 */
export default function Beats({ beats }: { beats: Beat[] }) {
  if (beats.length === 0) return null;

  return (
    <section className="beats" aria-label="What just happened" aria-live="polite">
      {beats.map((entry, i) => (
        <div className={`beat kind-${entry.kind}`} key={`${i}-${entry.text}`}>
          {entry.character ? (
            <span className="beat-card">
              <CardFace character={entry.character} sizes="88px" />
              <span className="beat-fate">
                {entry.fate === "returned" ? "Back to the court" : "Out of the game"}
              </span>
            </span>
          ) : (
            <span className="beat-mark" aria-hidden>
              {entry.kind === "challenge" ? "!" : entry.kind === "out" ? "✖" : "•"}
            </span>
          )}
          <p className="beat-text">{entry.text}</p>
        </div>
      ))}
    </section>
  );
}

/** Short label for the character a beat revealed, used by screen readers. */
export function beatLabel(entry: Beat): string {
  return entry.character ? `${entry.text} (${CHARACTER_INFO[entry.character].name})` : entry.text;
}
