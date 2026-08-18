"use client";

import { CHARACTER_INFO } from "@/lib/coup/deck";
import { FORCED_COUP_NOTE, REFERENCE } from "@/lib/coup/reference";

/** The reference card, on screen for anyone who wants it mid-game. */
export default function Reference({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-scrim" role="dialog" aria-modal aria-label="Cheat sheet">
      <div className="sheet-card">
        <header className="sheet-head">
          <span className="eyebrow">Cheat sheet</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close the cheat sheet">
            ✕
          </button>
        </header>

        <ul className="ref-list">
          {REFERENCE.map((rowItem) => {
            const info = rowItem.character ? CHARACTER_INFO[rowItem.character] : null;
            return (
              <li
                className={`ref-row${rowItem.character ? " has-character" : ""}`}
                key={rowItem.title}
                style={
                  rowItem.character
                    ? { ["--c" as string]: `var(--${rowItem.character})` }
                    : undefined
                }
              >
                {info && (
                  <span className="ref-character">
                    <span className="ref-sigil" aria-hidden>
                      {info.glyph}
                    </span>
                    {info.name}
                  </span>
                )}
                <span className="ref-body">
                  <span className="ref-title">{rowItem.title}</span>{" "}
                  <span className="ref-detail">{rowItem.detail}</span>
                </span>
                <span className="ref-counter">{rowItem.counter}</span>
              </li>
            );
          })}
        </ul>

        <p className="ref-note">{FORCED_COUP_NOTE}</p>

        <button className="btn btn-primary" onClick={onClose}>
          Back to the game
        </button>
      </div>
    </div>
  );
}
