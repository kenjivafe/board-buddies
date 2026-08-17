"use client";

import { useState } from "react";
import { CardBack, CardFace } from "./Cards";
import type { KnownCard } from "@/lib/coup/view";

/**
 * Hidden information on a shared phone: nothing sensitive renders until the
 * named player says they are holding it.
 */
export function PassGate({
  name,
  note,
  cta,
  children,
}: {
  name: string;
  note?: string;
  cta?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (open) return <>{children}</>;

  return (
    <section className="gate">
      <span className="eyebrow">Pass the phone to</span>
      <h2 className="gate-name">{name}</h2>
      {note && <p className="gate-note">{note}</p>}
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        {cta ?? `I'm ${name}`}
      </button>
      <p className="hint">Everyone else, look away.</p>
    </section>
  );
}

/**
 * Cards stay face down until held, so a hand is never left showing on a phone
 * that is about to change hands.
 */
export function PeekHand({ cards }: { cards: KnownCard[] }) {
  const [peeking, setPeeking] = useState(false);
  const live = cards.filter((c) => !c.revealed);

  return (
    <button
      className="peek"
      aria-pressed={peeking}
      aria-label={peeking ? "Hiding your hand" : "Hold to look at your hand"}
      onPointerDown={() => setPeeking(true)}
      onPointerUp={() => setPeeking(false)}
      onPointerLeave={() => setPeeking(false)}
      onPointerCancel={() => setPeeking(false)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") setPeeking(true);
      }}
      onKeyUp={() => setPeeking(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* both layers stay mounted so the art is loaded before the first hold */}
      <span className="peek-cards">
        {live.map((card) => (
          <span className={`flip${peeking ? " open" : ""}`} key={card.id}>
            <CardFace character={card.character} />
            <span className="back-layer">
              <CardBack />
            </span>
          </span>
        ))}
      </span>
      <span className="peek-label">{peeking ? "Release to hide" : "Hold to look"}</span>
    </button>
  );
}
