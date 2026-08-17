"use client";

import { rankLabel, SUIT_COLOR, SUIT_GLYPH } from "@/lib/kings-cup/deck";
import type { Card } from "@/lib/kings-cup/types";

export default function PlayingCard({
  card,
  faceUp,
  remaining,
}: {
  card: Card | null;
  faceUp: boolean;
  remaining: number;
}) {
  const color = card ? SUIT_COLOR[card.suit] : "black";
  const royal = !!card && card.rank >= 11;

  return (
    <div className="card-slot" style={{ position: "relative" }}>
      <div className={`card-flip${faceUp && card ? " face-up" : ""}`}>
        <div className="card-face card-back" aria-hidden={faceUp}>
          <span className="crown">{"\u2654"}</span>
        </div>
        <div
          className={`card-face card-front ${color}${royal ? " royal" : ""}`}
          aria-hidden={!faceUp}
        >
          {card && (
            <>
              <span className="frame" aria-hidden />
              <span className="corner tl" aria-hidden>
                <span className="r">{rankLabel(card.rank)}</span>
                <span className="s">{SUIT_GLYPH[card.suit]}</span>
              </span>
              {royal || card.rank === 1 ? (
                <span className="royal-center">{rankLabel(card.rank)}</span>
              ) : (
                <span className="pip-center">{SUIT_GLYPH[card.suit]}</span>
              )}
              <span className="corner br" aria-hidden>
                <span className="r">{rankLabel(card.rank)}</span>
                <span className="s">{SUIT_GLYPH[card.suit]}</span>
              </span>
            </>
          )}
        </div>
      </div>
      <span className="deck-count">
        {remaining} {remaining === 1 ? "card" : "cards"} left
      </span>
    </div>
  );
}
