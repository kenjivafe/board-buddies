"use client";

import { CHARACTER_INFO } from "@/lib/coup/deck";
import { BLOCKS, BLOCK_NOTE, FORCED_COUP_NOTE, REFERENCE } from "@/lib/coup/reference";

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

        {/*
          The other half of the sheet. The card in the box is written from the
          actor's side, so a block only ever appears as small print under the
          action it stops — which is no help at all to somebody looking at a
          Captain and wondering what it does besides steal.
        */}
        <span className="eyebrow ref-heading">Blocks</span>
        <ul className="ref-list">
          {BLOCKS.map((block) => {
            const info = CHARACTER_INFO[block.character];
            return (
              <li
                className="ref-row has-character"
                key={`${block.character}-${block.stops}`}
                style={{ ["--c" as string]: `var(--${block.character})` }}
              >
                <span className="ref-character">
                  <span className="ref-sigil" aria-hidden>
                    {info.glyph}
                  </span>
                  {info.name}
                </span>
                <span className="ref-body">
                  <span className="ref-title">Blocks {block.stops}</span>
                </span>
                <span className="ref-counter">
                  {block.targetOnly ? "Only the target may." : "Anyone may."}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="ref-note">{BLOCK_NOTE}</p>

        <button className="btn btn-primary" onClick={onClose}>
          Back to the game
        </button>
      </div>
    </div>
  );
}
