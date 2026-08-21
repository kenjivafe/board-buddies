import { CHARACTERS, CHARACTER_INFO } from "./deck";
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
  row("exchange"),
  row("coup"),
];

export interface BlockRow {
  character: Character;
  /** the action this card stops */
  stops: string;
  /** whether only the target of the action may claim it */
  targetOnly: boolean;
}

/**
 * The same rules read from the other end: not "what can stop this action" but
 * "what can this card do".
 *
 * The list above is the reference card that ships in the box, and it is
 * written from the actor's side — every block appears only as small print in
 * the counter line of the action it stops. That is the wrong way round for the
 * question a player actually has, which is what the card in their hand is for.
 * Hold a Captain and the sheet told you about Steal and said nothing about the
 * other half of the card.
 *
 * Inverted from ACTIONS rather than typed out, for the same reason the counter
 * lines are: the sheet cannot drift from what the reducer enforces.
 */
export const BLOCKS: BlockRow[] = CHARACTERS.flatMap((character) =>
  (Object.keys(ACTIONS) as ActionKind[])
    .filter((kind) => ACTIONS[kind].blockedBy.includes(character))
    .map((kind) => ({
      character,
      stops: ACTIONS[kind].label,
      targetOnly: ACTIONS[kind].blockableBy === "target",
    }))
);

/** A block is a claim like any other, so it can be called a lie like any other. */
export const BLOCK_NOTE = "A block is a claim. Anyone can challenge it.";

export const FORCED_COUP_NOTE = "If 10+ coins, you must Coup.";
