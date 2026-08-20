"use client";

import { useState } from "react";
import Image from "next/image";
import { ROLE_INFO } from "@/lib/werewolf/roles";
import type { Role } from "@/lib/werewolf/types";

/**
 * A card's ink is its side: red for the pack, blue for the village, green for
 * the Tanner. The only thing worth colour-coding here is which of the three a
 * card belongs to — and at the end, that is exactly what you are reading for.
 */
export const tint = (role: Role) => `var(--team-${ROLE_INFO[role].team})`;

/** Native size of the card art. Every frame in the app follows this ratio. */
export const CARD_W = 1024;
export const CARD_H = 1536;

export const TEAM_NAME: Record<string, string> = {
  werewolf: "With the pack",
  village: "With the village",
  tanner: "On nobody's side",
};

/**
 * A body in a chair. Deliberately anonymous — a room has no avatars and the
 * point of the roster is who is *here*, not who anybody is.
 */
export function Person({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <circle cx="12" cy="8" r="3.6" fill="currentColor" />
      <path
        d="M4.6 20.2c0-4.1 3.3-6.6 7.4-6.6s7.4 2.5 7.4 6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The one light in the game. `phase` slides the bite out of the disc: 0 is
 * full, 1 is a fingernail.
 */
export function Moon({
  phase = 0.34,
  size,
  className,
}: {
  phase?: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`moon${phase <= 0 ? " full" : ""}${className ? ` ${className}` : ""}`}
      style={{
        ["--phase" as string]: phase,
        ...(size ? { ["--size" as string]: `${size}px` } : {}),
      }}
      aria-hidden
    />
  );
}

/** A hairline broken by a label — this game's answer to Coup's chevron. */
export function Rule({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rule" aria-hidden>
      {children && <span>{children}</span>}
    </div>
  );
}

/**
 * The page's ground, and the only thing that knows what time it is. Fixed
 * behind everything, so a long argument doesn't scroll the dawn away.
 */
export function Sky({ time }: { time: "night" | "day" | "dead" }) {
  return <div className="sky" data-time={time} aria-hidden />;
}

/**
 * Hidden information on a shared phone: nothing sensitive renders until the
 * named player says they are the one holding it.
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
      <Moon size={62} phase={0.2} />
      <span className="eyebrow">Pass the phone to</span>
      <h2 className="gate-name">{name}</h2>
      {note && <p className="gate-note">{note}</p>}
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        {cta ?? `I'm ${name}`}
      </button>
      <p className="hint">Everyone else, eyes shut.</p>
    </section>
  );
}

export type CardSize = "lg" | "md" | "sm" | "xs";

/**
 * What the browser is told to fetch. These must track the widths in
 * werewolf.css — the sources are ~3.5 MB each, so an over-generous hint here
 * is the difference between a 60 KB card and a 180 KB one.
 */
const SIZES: Record<CardSize, string> = {
  lg: "(max-width: 420px) 64vw, 216px",
  md: "(max-width: 420px) 40vw, 148px",
  sm: "78px",
  xs: "38px",
};

/**
 * How big to draw a hand of cards. Being shown a card is the entire reward for
 * waking up, so one card gets the full width and two still get read at a
 * glance — anything more is a row of thumbnails, which is what this avoids.
 */
export const sizeForCount = (n: number): CardSize => (n <= 1 ? "lg" : n === 2 ? "md" : "sm");

/**
 * A card face. The art carries the character's printed name across the top, so
 * nothing is ever drawn over it — a chip, where one is wanted, sits at the foot.
 */
export function CardFace({
  role,
  chip,
  size = "lg",
}: {
  role: Role;
  chip?: string;
  size?: CardSize;
}) {
  const info = ROLE_INFO[role];
  return (
    <span
      className={`role-card${size === "lg" ? "" : ` ${size}`}`}
      style={{ ["--c" as string]: tint(role) }}
    >
      <Image
        src={`/werewolf/${info.art}`}
        alt={info.name}
        width={CARD_W}
        height={CARD_H}
        sizes={SIZES[size]}
      />
      {chip && <span className="role-card-chip">{chip}</span>}
    </span>
  );
}

export function CardBack({ size = "lg" }: { size?: CardSize }) {
  return <span className={`card-back${size === "lg" ? "" : ` ${size}`}`} aria-hidden />;
}

/**
 * A card with its caption underneath. Where the art renders too small for its
 * own printed name to be legible, the name goes below it instead.
 */
export function CardSlot({
  role,
  caption,
  size = "sm",
}: {
  role: Role | null;
  caption?: string;
  size?: CardSize;
}) {
  return (
    <span className="card-slot">
      {role ? <CardFace role={role} size={size} /> : <CardBack size={size} />}
      {caption && <span className="card-cap">{caption}</span>}
    </span>
  );
}

/** What a card does, printed under it rather than over the art. */
export function RoleBrief({ role }: { role: Role }) {
  const info = ROLE_INFO[role];
  return (
    <div className="role-brief" style={{ ["--c" as string]: tint(role) }}>
      <div className="role-brief-name">{info.name}</div>
      <span className="role-brief-team">{TEAM_NAME[info.team]}</span>
      <p className="role-brief-blurb">{info.blurb}</p>
    </div>
  );
}

/**
 * A card kept face down until held, so it is never left showing on a phone
 * that is about to change hands.
 */
export function PeekCard({ role }: { role: Role }) {
  const [peeking, setPeeking] = useState(false);

  return (
    <button
      className={`peek${peeking ? " open" : ""}`}
      aria-pressed={peeking}
      aria-label={peeking ? "Hiding your card" : "Hold to look at your card"}
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
      {/* both layers stay mounted, so the art is loaded before the first hold */}
      <span className="peek-card">
        <span className="front">
          <CardFace role={role} />
        </span>
        <span className="back">
          <CardBack />
        </span>
      </span>
      <span className="peek-label">{peeking ? "Release to hide" : "Hold to look"}</span>
    </button>
  );
}

export function Waiting({ text, on }: { text: string; on?: string }) {
  return (
    <div className="waiting">
      <span className="waiting-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="waiting-text">{text}</span>
      {on && <span className="waiting-on">{on}</span>}
    </div>
  );
}
