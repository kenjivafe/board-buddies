"use client";

import { useId } from "react";

/**
 * The back of the deck.
 *
 * Drawn rather than painted. A heraldic lattice is geometry — vector keeps it
 * crisp at every size the app draws a card, from the 48px court key to a full
 * hand, costs a couple of kilobytes against a couple of megabytes, and takes
 * its colours from the same custom properties as everything else.
 *
 * **Two-way** in the strict sense: the upper half is drawn once as `#crest`
 * and then used again rotated a half-turn about the centre, so the two halves
 * are identical by construction and the card cannot be held upside down. That
 * is also why five distinct symbols can sit in a rotationally symmetric
 * design at all — each appears twice, once in each half, rather than five of
 * them trying to divide a circle evenly.
 *
 * The symbols are the five characters, in the five colours the rest of the
 * game already uses for them: the Captain's diamond, the Duke's star, the
 * Assassin's spade, the Ambassador's clover, the Contessa's heart.
 *
 * Every id is scoped to the instance. A hand is two cards and both are drawn
 * face down while the phone is being held out, so fixed ids would put the same
 * id in the document twice and leave each card's patterns pointing at whichever
 * copy the browser saw first.
 */

/** the card's own proportions, so the back and the faces are one shape */
const W = 1054;
const H = 1492;
const CX = W / 2;
const CY = H / 2;

/** A five-pointed star, points up, drawn to a unit radius. */
const star = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.4;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(Math.cos(a) * r).toFixed(4)},${(Math.sin(a) * r).toFixed(4)}`);
  }
  return `M${pts.join("L")}Z`;
})();

/** All five at a unit scale about the origin, so one transform places any of them. */
const SUITS: { d: string; fill: string }[] = [
  // diamond — the Captain
  { d: "M0,-1 L0.66,0 L0,1 L-0.66,0 Z", fill: "var(--captain)" },
  // star — the Duke
  { d: star, fill: "var(--duke)" },
  // spade — the Assassin
  {
    d: "M0,-1 C0.42,-0.5 1,-0.16 1,0.24 C1,0.62 0.66,0.8 0.36,0.66 C0.2,0.58 0.1,0.44 0.08,0.34 L0.26,1 L-0.26,1 L-0.08,0.34 C-0.1,0.44 -0.2,0.58 -0.36,0.66 C-0.66,0.8 -1,0.62 -1,0.24 C-1,-0.16 -0.42,-0.5 0,-1 Z",
    fill: "var(--assassin)",
  },
  // clover — the Ambassador
  {
    d: "M-0.12,0.28 C-0.5,0.56 -1,0.3 -1,-0.1 C-1,-0.44 -0.66,-0.62 -0.38,-0.5 C-0.5,-0.8 -0.3,-1 0,-1 C0.3,-1 0.5,-0.8 0.38,-0.5 C0.66,-0.62 1,-0.44 1,-0.1 C1,0.3 0.5,0.56 0.12,0.28 L0.28,1 L-0.28,1 Z",
    fill: "var(--ambassador)",
  },
  // heart — the Contessa
  {
    d: "M0,1 C-0.34,0.62 -1,0.22 -1,-0.32 C-1,-0.74 -0.62,-1 -0.32,-0.86 C-0.16,-0.78 -0.05,-0.64 0,-0.5 C0.05,-0.64 0.16,-0.78 0.32,-0.86 C0.62,-1 1,-0.74 1,-0.32 C1,0.22 0.34,0.62 0,1 Z",
    fill: "var(--contessa)",
  },
];

/**
 * Where the five sit: a ring in the upper half, with the whole ring used again
 * a half-turn round. Two rosettes rather than one, because five distinct
 * things cannot divide a circle into a shape that survives being turned over —
 * drawing the ring twice is what makes the card reversible.
 *
 * Kept well clear of the midline. The first attempt reached the centre from
 * both ends and the two frames crossed into an X, which read as a mistake
 * rather than as a pattern.
 */
const RING = { cy: CY - 330, r: 132, size: 52 };
const PLACES = SUITS.map((_, i) => {
  const a = (Math.PI * 2 * i) / SUITS.length - Math.PI / 2;
  return {
    x: CX + Math.cos(a) * RING.r,
    y: RING.cy + Math.sin(a) * RING.r,
    r: RING.size,
  };
});

/** The frame around one rosette: a lozenge, its points ticked. */
const LOZ = { top: CY - 630, bottom: CY - 30, half: 300, mid: CY - 330 };

export default function CardBackArt() {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `cb-${name}-${uid}`;
  const ref = (name: string) => `#${id(name)}`;

  return (
    <svg
      className="back-art"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable={false}
    >
      <defs>
        {/* the same slant the faces carry, at the same angle */}
        <pattern id={id("slant")} width="26" height="26" patternTransform="rotate(18)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="26" stroke="var(--ink)" strokeWidth="7" opacity="0.05" />
        </pattern>

        {/* the diamond lattice the crest sits on */}
        <pattern id={id("lattice")} width="96" height="96" patternUnits="userSpaceOnUse">
          <path
            d="M48,0 L96,48 L48,96 L0,48 Z M48,24 L72,48 L48,72 L24,48 Z"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2.4"
            opacity="0.17"
          />
        </pattern>

        <clipPath id={id("field")}>
          <rect x="30" y="30" width={W - 60} height={H - 60} rx="14" />
        </clipPath>

        {/* Half the design's linework, in currentColor so the off-register
            pass below can be printed in a different ink. */}
        <g id={id("lines")} stroke="currentColor" fill="none">
          {/* the lozenge the rosette is set into */}
          <path
            d={`M${CX},${LOZ.top} L${CX + LOZ.half},${LOZ.mid} L${CX},${LOZ.bottom} L${CX - LOZ.half},${LOZ.mid} Z`}
            strokeWidth="6"
            opacity="0.55"
          />
          <path
            d={`M${CX},${LOZ.top + 30} L${CX + LOZ.half - 21},${LOZ.mid} L${CX},${LOZ.bottom - 30} L${CX - LOZ.half + 21},${LOZ.mid} Z`}
            strokeWidth="2.4"
            opacity="0.4"
          />

          {/* a tick at each of its four points, the way a plate is registered */}
          {[
            [CX, LOZ.top + 62],
            [CX + LOZ.half - 44, LOZ.mid],
            [CX, LOZ.bottom - 62],
            [CX - LOZ.half + 44, LOZ.mid],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x},${y - 15} L${x + 11},${y} L${x},${y + 15} L${x - 11},${y} Z`}
              fill="currentColor"
              stroke="none"
              opacity="0.4"
            />
          ))}

          {/* the ring the five are strung on, double-ruled */}
          <circle cx={CX} cy={RING.cy} r={RING.r + 74} strokeWidth="5" opacity="0.5" />
          <circle cx={CX} cy={RING.cy} r={RING.r + 64} strokeWidth="2" opacity="0.32" />
          <circle cx={CX} cy={RING.cy} r={RING.r - 66} strokeWidth="2.4" opacity="0.3" />
        </g>

        {/* The midline: the one part of the design that is its own reflection,
            and the seam the two halves are turned about. */}
        <g id={id("seam")} stroke="currentColor" fill="none">
          <path d={`M120,${CY} H${W - 120}`} strokeWidth="4" opacity="0.42" />
          <path d={`M120,${CY - 9} H${W - 120}`} strokeWidth="1.8" opacity="0.24" />
          <path d={`M120,${CY + 9} H${W - 120}`} strokeWidth="1.8" opacity="0.24" />
          <path
            d={`M${CX},${CY - 34} L${CX + 24},${CY} L${CX},${CY + 34} L${CX - 24},${CY} Z`}
            fill="var(--stock)"
            strokeWidth="4"
            opacity="0.55"
          />
        </g>

        {/* and the five, flat-filled, in their own colours */}
        <g id={id("suits")}>
          {PLACES.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y}) scale(${p.r})`}>
              <path d={SUITS[i].d} fill={SUITS[i].fill} />
            </g>
          ))}
        </g>
      </defs>

      {/* the stock, and the clean border around it */}
      <rect x="0" y="0" width={W} height={H} rx="26" fill="var(--bone)" />
      <rect
        x="30"
        y="30"
        width={W - 60}
        height={H - 60}
        rx="14"
        fill="var(--stock)"
        stroke="var(--ink)"
        strokeWidth="3"
        strokeOpacity="0.5"
      />

      <g clipPath={`url(#${id("field")})`}>
        <rect x="30" y="30" width={W - 60} height={H - 60} fill={`url(#${id("lattice")})`} />
        <rect x="30" y="30" width={W - 60} height={H - 60} fill={`url(#${id("slant")})`} />

        {/*
          Off-register, the way a press lays one plate a hair out from the
          next: the red pass nudged off the black, at a strength you read as
          age rather than as a mistake. Linework only — a suit printed twice
          would be a smudge, not a misprint.
        */}
        <g color="var(--contessa)" opacity="0.18">
          <use href={ref("lines")} x="6" y="-5" />
          <use href={ref("lines")} transform={`rotate(180 ${CX} ${CY}) translate(6 -5)`} />
        </g>

        <g color="var(--ink)">
          <use href={ref("lines")} />
          <use href={ref("lines")} transform={`rotate(180 ${CX} ${CY})`} />
          <use href={ref("seam")} />
        </g>
        <use href={ref("suits")} />
        <use href={ref("suits")} transform={`rotate(180 ${CX} ${CY})`} />
      </g>
    </svg>
  );
}
