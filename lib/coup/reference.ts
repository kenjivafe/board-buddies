import { CHARACTER_INFO } from "./deck";
import { ACTIONS } from "./rules";
import type { ActionKind, Character } from "./types";

export interface ReferenceRow {
  /** set when the action requires claiming a character */
  character: Character | null;
  title: string;
  detail: string;
  /** what can stop it */
  counter: string;
}

/**
 * Derived from ACTIONS rather than transcribed, so the sheet on screen always
 * says what the reducer actually enforces.
 */
function counterFor(kind: ActionKind): string {
  const info = ACTIONS[kind];
  const challengeable = info.claim !== null;
  const blockers = info.blockedBy;

  if (!challengeable && blockers.length === 0) return "Cannot be blocked or challenged.";

  const blocked =
    blockers.length === 0
      ? "Cannot be blocked."
      : `Can be blocked by ${info.blockableBy === "target" ? "the target" : "any player"} claiming ${blockers
          .map((b) => CHARACTER_INFO[b].name)
          .join(" or ")}.`;

  return challengeable ? blocked : `Cannot be challenged. ${blocked}`;
}

const row = (kind: ActionKind): ReferenceRow => {
  const info = ACTIONS[kind];
  return {
    character: info.claim,
    title: info.label,
    detail: info.sheet,
    counter: counterFor(kind),
  };
};

/** Ordered to match the reference card that ships with the game. */
export const REFERENCE: ReferenceRow[] = [
  row("income"),
  row("foreign_aid"),
  row("tax"),
  row("steal"),
  row("assassinate"),
  {
    // the Contessa is the one card with no action of its own
    character: "contessa",
    title: "Contessa",
    detail: "Blocks assassination.",
    counter: "Cannot be blocked.",
  },
  row("exchange"),
  row("coup"),
];

export const FORCED_COUP_NOTE = "If 10+ coins, you must Coup.";
