/**
 * The handful of glyphs that sit in chrome rather than in a game.
 *
 * Drawn rather than typed. An emoji is a different typeface on every platform,
 * renders in its own colours whatever the page is doing, and lands at whatever
 * size and baseline the vendor felt like — which is fine in a sentence and
 * wrong in a control, where it has to line up with a label and take the
 * button's own colour.
 */

type IconProps = { size?: number };

const base = (size: number) => ({
  viewBox: "0 0 24 24",
  width: size,
  height: size,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false as const,
});

/** A speaker with its two waves. */
export function SpeakerOn({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4Z" fill="currentColor" stroke="none" />
      <path d="M15.2 9.4a3.6 3.6 0 0 1 0 5.2" />
      <path d="M17.8 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

/** The same speaker, struck through. */
export function SpeakerOff({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4Z" fill="currentColor" stroke="none" />
      <path d="m15.5 10 5 4m0-4-5 4" />
    </svg>
  );
}

/** A door with somebody going through it. */
export function ExitDoor({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M13.5 4.5H6.2A1.2 1.2 0 0 0 5 5.7v12.6a1.2 1.2 0 0 0 1.2 1.2h7.3" />
      <path d="M16.4 8.6 19.8 12l-3.4 3.4" />
      <path d="M19.4 12H10" />
    </svg>
  );
}
