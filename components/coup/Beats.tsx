"use client";

import { CHARACTER_INFO } from "@/lib/coup/deck";
import type { Beat } from "@/lib/coup/types";
import { CardBack, CardFace } from "./Cards";

/**
 * The story of the action on the table: who blocked, who called it, whether the
 * claim held, and which influence was handed over.
 *
 * A challenge resolves in one step internally, which left the table with no
 * moment to actually see the card. Beats that turned a card face up show it
 * here, and say where it went — back into the court if it was proven, or out
 * of the game if it was surrendered.
 *
 * A proven card also *moves*. Returning it and drawing a replacement is a real
 * change of hand that looked like nothing happening: the swap is face down at
 * both ends, and because there are three of each character in fifteen cards
 * the same face comes back about a quarter of the time. Players read that as
 * the game failing to swap anything. So the card leaves towards the deck and a
 * back arrives in its place — the mechanic, shown rather than described.
 */
export default function Beats({ beats }: { beats: Beat[] }) {
  if (beats.length === 0) return null;

  return (
    <section className="beats" aria-label="What just happened" aria-live="polite">
      {beats.map((entry, i) => (
        <div className={`beat kind-${entry.kind}`} key={`${i}-${entry.text}`}>
          {entry.character ? (
            <span className="beat-card">
              {entry.fate === "returned" ? (
                <span className="beat-swap">
                  <span className="going">
                    <CardFace character={entry.character} sizes="88px" />
                  </span>
                  {/* what they drew is theirs alone, so it arrives face down */}
                  <span className="coming" aria-hidden>
                    <CardBack />
                  </span>
                </span>
              ) : (
                <CardFace character={entry.character} sizes="88px" />
              )}
              {/* The label has to describe the whole swap, not the card. It said
                  "back to the court", which was true of the face that left and
                  plainly false of the back sitting there once it had. */}
              <span className="beat-fate">
                {entry.fate === "returned" ? "Returned · redrawn" : "Out of the game"}
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
