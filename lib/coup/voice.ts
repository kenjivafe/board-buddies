import type { Character } from "./types";

/**
 * Every voice line in the game, and the exact words spoken.
 *
 * This is the single source of truth: `scripts/generate-voices.mjs` reads it to
 * synthesise the files, and the client reads it to know how many variants a cue
 * has. Adding a line here and re-running the script is the whole workflow.
 *
 * The cast rule: the narrator covers anything still hidden, and a character may
 * only speak once its card is genuinely face up. See AudioCue in types.ts.
 */

export type VoiceId = "narrator" | Character;

export interface VoiceProfile {
  id: VoiceId;
  /** the brief handed to ElevenLabs voice design */
  description: string;
}

export const VOICES: VoiceProfile[] = [
  {
    id: "narrator",
    description:
      "Deep, mature male voice with a refined British accent. Restrained, sophisticated and quietly ominous. Calm, authoritative, deliberate pacing. An impartial chronicler of a dangerous political game — never a fantasy RPG narrator, never a movie-trailer voice.",
  },
  {
    id: "duke",
    description:
      "Aristocratic British man in his late fifties. Deep, resonant baritone. Powerful, commanding, sophisticated, cold and controlled. A wealthy statesman entirely accustomed to authority.",
  },
  {
    id: "assassin",
    description:
      "Man in his early thirties. Low, quiet, controlled voice with a subtle British accent. Calculating and emotionally detached, smooth, with understated menace. Never shouty.",
  },
  {
    id: "captain",
    description:
      "Rugged naval officer in his late forties. Strong baritone with a weathered vocal texture and a commanding maritime accent. Disciplined, rough but intelligent.",
  },
  {
    id: "ambassador",
    description:
      "Sophisticated diplomat in his early forties. Smooth, refined British voice with an elegant upper-class accent. Charming, persuasive, intelligent, calculating, with subtle wit.",
  },
  {
    id: "contessa",
    description:
      "Sophisticated aristocratic woman in her late forties. Refined upper-class accent, low and elegant. Calm, intelligent, intimidating, cold and quietly sinister. Never exaggerated, never seductive.",
  },
];

/** path stem under /audio → the lines to record for it, one file per line */
export type VoiceLines = Record<string, string[]>;

export const LINES: Record<VoiceId, VoiceLines> = {
  narrator: {
    // An action is announced without naming the influence claimed for it — the
    // card is still face down and the claim may well be a lie.
    action_income: ["Income is taken."],
    action_foreign_aid: ["Foreign Aid is requested."],
    action_tax: ["Tax is claimed."],
    action_steal: ["A steal is attempted."],
    action_exchange: ["An exchange is requested."],
    action_assassination: ["An assassination is attempted."],
    action_coup: ["A coup is ordered."],
    challenge: [
      "The claim has been challenged.",
      "The claim is challenged.",
      "A challenge has been made.",
    ],
    concede: ["The claim is conceded.", "The claim has been conceded."],
    false_claim: ["The claim was false.", "The claim could not be proven."],
  },

  duke: {
    challenge_reveal: ["You should have kept your doubts to yourself."],
    action_tax: [
      "Now, collect what is owed.",
      "The treasury answers to me.",
      "Three coins. A modest price for my authority.",
    ],
    block_foreign_aid: [
      "You will receive nothing.",
      "The treasury is closed to you.",
      "You will get nothing from me.",
    ],
    loss: ["This is not over.", "You have not seen the last of me.", "A temporary loss."],
    final_loss: [
      "You may take my power, but never my loyalty.",
      "You have won this battle. Nothing more.",
      "Remember who you have defeated.",
    ],
  },

  assassin: {
    challenge_reveal: ["A mistake to challenge me."],
    action_assassination: [
      "Your time has come.",
      "This ends now.",
      "You should have stayed out of my way.",
      "You made this necessary.",
    ],
    loss: [
      "A temporary setback.",
      "You won't be so fortunate next time.",
      "This changes nothing.",
    ],
    final_loss: [
      "You should have killed me sooner.",
      "Enjoy your victory while it lasts.",
      "You won't be so lucky again.",
    ],
  },

  captain: {
    challenge_reveal: ["You dare question my authority?"],
    action_steal: ["I'll be taking that.", "Consider it seized.", "Hand it over."],
    block_steal: ["Not from my ship.", "You will take nothing from me.", "Try taking it."],
    loss: ["My command is compromised.", "This isn't over.", "I've survived worse."],
    final_loss: [
      "My command ends here.",
      "The sea has claimed me at last.",
      "I served my crew well.",
    ],
  },

  ambassador: {
    challenge_reveal: ["Your suspicion was misplaced."],
    action_exchange: [
      "Let us make a better arrangement.",
      "Perhaps we can reach an understanding.",
      "A simple exchange.",
    ],
    // The spec filed these under block_foreign_aid, but only the Duke blocks
    // foreign aid — the Ambassador blocks stealing. Filed where they can fire.
    block_steal: [
      "I'm afraid that won't be possible.",
      "Your request is denied.",
      "I'm afraid the arrangement cannot proceed.",
    ],
    loss: [
      "Then our arrangement ends here.",
      "An unfortunate development.",
      "We shall see who has the last word.",
    ],
    final_loss: [
      "Then our business is concluded.",
      "It seems negotiations have failed.",
      "You have made your decision.",
    ],
  },

  contessa: {
    challenge_reveal: ["You were foolish to challenge me."],
    block_assassinate: [
      "You should have chosen someone else.",
      "You really thought I would be so easily removed?",
      "How unfortunate for you.",
      "I'm afraid you'll have to try again.",
    ],
    loss: ["You have made an enemy.", "You will regret this.", "Enjoy your little victory."],
    final_loss: [
      "You will regret this.",
      "You may have won, but at what cost?",
      "Remember this moment.",
    ],
  },
};

/** How many variants exist for a cue path, e.g. "duke/loss" → 3. */
export const VARIANTS: Record<string, number> = Object.fromEntries(
  Object.entries(LINES).flatMap(([voice, lines]) =>
    Object.entries(lines).map(([stem, texts]) => [`${voice}/${stem}`, texts.length])
  )
);

/** Resolves a cue path to a concrete file, picking a variant at random. */
export function fileFor(path: string): string | null {
  const count = VARIANTS[path];
  if (!count) return null;
  const pick = String(Math.floor(Math.random() * count) + 1).padStart(2, "0");
  return `/audio/${path}_${pick}.mp3`;
}
