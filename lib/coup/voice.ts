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
    // Deliberately austere and weathered: the earlier take was another smooth
    // refined Englishman and was indistinguishable from the Ambassador.
    description:
      "British man in his sixties. Deep, dry, faintly gravelly voice with a refined but austere accent. Restrained, detached and quietly ominous, with slow deliberate pacing and a trace of weariness. An impartial chronicler of a dangerous political game — never warm, never charming, never a movie-trailer voice.",
  },
  {
    id: "duke",
    // the card shows an East Asian statesman in imperial robes
    description:
      "An aristocratic Chinese man in his late fifties. He speaks English with a clear, unmistakable East Asian accent — dignified and precise rather than broad. Deep, resonant baritone. Powerful, commanding, sophisticated, cold and controlled: a wealthy statesman entirely accustomed to authority.",
  },
  {
    id: "assassin",
    // The card shows a woman, whatever the brief said. Leading with that,
    // emphatically, because a softer phrasing came back male.
    description:
      "A woman. Female voice, in her early thirties, with a distinctly Russian accent. Husky, raspy, smoky texture — low and quiet, never shrill and never girlish. Cold, calculating and emotionally detached, with understated menace. Never shouty, never seductive.",
  },
  {
    id: "captain",
    description:
      "Rugged naval officer in his late forties. Strong baritone with a weathered vocal texture and a commanding maritime accent. Disciplined, rough but intelligent.",
  },
  {
    id: "ambassador",
    // the card shows a South Asian envoy in a turban
    description:
      "A sophisticated Indian diplomat in his mid forties. Deep, low, resonant chest voice — noticeably darker in pitch than a typical speaking voice. He speaks refined English with a cultured Indian accent, educated and understated rather than broad. Smooth and elegant, charming and persuasive, intelligent and calculating, with subtle wit.",
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
    // An action can succeed on a claim nobody tested. The influence stays face
    // down whether it was real or not, so the narrator closes the loop instead.
    // Never played when a challenge proved the claim — the character has
    // already spoken for the action itself.
    resolve_income: ["Income is collected."],
    resolve_foreign_aid: ["Foreign Aid is received."],
    resolve_tax: ["The tax is collected."],
    resolve_steal: ["The steal succeeds."],
    resolve_exchange: ["The exchange is completed."],
    resolve_assassination: ["The assassination succeeds."],
    resolve_coup: ["The coup is carried out."],
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

/**
 * Where to start listening. Called once when a device begins watching a game,
 * so lines raised before it was looking are skipped rather than fired off at
 * once — and a fresh game, which has no cues at all, starts from zero.
 *
 * The subtle part: this must be called even when there is nothing to skip.
 * Deferring it until the first non-empty batch treats the opening line of the
 * game as history and swallows it.
 */
export function primeFrom(cues: { id: number }[]): number {
  return cues.reduce((max, c) => Math.max(max, c.id), 0);
}

/** Cues not yet heard, oldest first. */
export function freshCues<T extends { id: number }>(cues: T[], lastHeard: number): T[] {
  return cues.filter((c) => c.id > lastHeard).sort((a, b) => a.id - b.id);
}

/** Resolves a cue path to a concrete file, picking a variant at random. */
export function fileFor(path: string): string | null {
  const count = VARIANTS[path];
  if (!count) return null;
  const pick = String(Math.floor(Math.random() * count) + 1).padStart(2, "0");
  return `/audio/${path}_${pick}.mp3`;
}
