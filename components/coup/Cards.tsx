"use client";

import Image from "next/image";
import { CHARACTER_INFO } from "@/lib/coup/deck";
import type { Character } from "@/lib/coup/types";
import type { CardView } from "@/lib/coup/view";

/** Intrinsic size of the card art — all five share it. */
export const CARD_W = 1054;
export const CARD_H = 1492;

/**
 * The printed card. The art carries the name and the ability text, so nothing
 * is drawn over it except the odd state chip.
 */
export function CardFace({
  character,
  spent = false,
  selected = false,
  onClick,
  label,
  caption = false,
  sizes = "(max-width: 520px) 46vw, 220px",
}: {
  character: Character;
  spent?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** short chip laid over the top of the art, e.g. "Give up" */
  label?: string;
  /** name printed under the card, for when it renders too small to read */
  caption?: boolean;
  sizes?: string;
}) {
  const info = CHARACTER_INFO[character];
  const body = (
    <>
      <span className="coup-card">
        <Image
          className="card-art"
          src={`/coup/${character}.png`}
          alt={info.name}
          width={CARD_W}
          height={CARD_H}
          sizes={sizes}
        />
        {label && <span className="card-tag">{label}</span>}
        {spent && <span className="spent-band">Spent</span>}
      </span>
      {caption && <span className="card-caption">{info.name}</span>}
    </>
  );

  const className = `card-slot${selected ? " selected" : ""}${spent ? " spent" : ""}`;
  const style = { ["--c" as string]: `var(--${character})` };

  if (!onClick) {
    return (
      <div className={className} style={style}>
        {body}
      </div>
    );
  }
  return (
    <button className={className} style={style} onClick={onClick} aria-pressed={selected}>
      {body}
    </button>
  );
}

/** A face-down card — same stock, nothing to read. */
export function CardBack() {
  return (
    <div className="card-slot" aria-hidden>
      <span className="coup-card back">
        <span className="back-panel">
          <span className="seal">◆</span>
        </span>
      </span>
    </div>
  );
}

/**
 * The two-slot influence readout on the roster. Face-down slots stay blank;
 * surrendered ones are public, so they show whose card it was.
 */
export function InfluencePips({ cards }: { cards: CardView[] }) {
  return (
    <span className="pips">
      {cards.map((card) => {
        if (!card.revealed || card.character === null) {
          return <span className="pip" key={card.id} title="Face down" aria-label="Face down" />;
        }
        const info = CHARACTER_INFO[card.character];
        return (
          <span
            className="pip spent"
            key={card.id}
            style={{ ["--c" as string]: `var(--${card.character})` }}
            title={`${info.name} — spent`}
            aria-label={`${info.name}, spent`}
          >
            <span aria-hidden>{info.glyph}</span>
          </span>
        );
      })}
    </span>
  );
}

export function Coins({ n }: { n: number }) {
  return (
    <span className="coins" aria-label={`${n} coins`}>
      <span className="coin-dot" aria-hidden />
      {n}
    </span>
  );
}
