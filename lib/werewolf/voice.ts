import { NIGHT_ORDER } from "./roles";
import { DAWN, OPENING, SLEEP, WAKE } from "./narration";

/**
 * The moderator's voice.
 *
 * One phone means the app is the narrator, so unlike Coup — where six
 * characters speak and the cast rule is about who is allowed to give away what
 * — there is exactly one speaker here, reading a fixed script. Nothing is ever
 * improvised and nothing is ever named, so there are no variants: each line is
 * the same words every game, which is what makes it sound like a moderator
 * rather than a soundboard.
 *
 * The lines are built from `narration.ts`, the same constants the screen
 * prints, so the words spoken and the words shown cannot drift apart.
 */

/**
 * Doubles as the folder under public/audio. Namespaced, because Coup already
 * owns `public/audio/narrator/` and the two must not collide.
 */
export const VOICE_ID = "werewolf/moderator";

export interface VoiceProfile {
  id: string;
  /** the brief handed to ElevenLabs voice design */
  description: string;
  /** what the designer reads back while auditioning the voice */
  preview?: string;
  /**
   * A voice that already exists upstream. Set this and the generator uses it
   * as-is — it never designs, and never touches the voice on the account.
   */
  voiceId?: string;
  /** 0.7–1.2. Below 1 the moderator slows down, which is most of the mood. */
  speed?: number;
}

export const VOICES: VoiceProfile[] = [
  {
    id: VOICE_ID,
    // A chosen voice rather than a designed one, so the description is only
    // here to say what the part is. Nothing reads it while `voiceId` is set.
    description:
      "The moderator of a game of Werewolf, reading a fixed script to a table in the dark.",
    voiceId: "yVZDNqbDqdOCuvlmZGd4",
    // the script is mostly two-word commands with a pause in the middle, and
    // at full speed they land before anyone has worked out it is them
    speed: 0.85,
  },
];

/** path stem under /audio/<VOICE_ID> → the line recorded for it */
export type VoiceLines = Record<string, string[]>;

export const LINES: Record<string, VoiceLines> = {
  [VOICE_ID]: {
    open: [OPENING],
    dawn: [DAWN],
    ...Object.fromEntries(NIGHT_ORDER.map((step) => [`wake_${step}`, [WAKE[step]]])),
    ...Object.fromEntries(NIGHT_ORDER.map((step) => [`sleep_${step}`, [SLEEP[step]]])),
  },
};

/** Every stem the script will record, for the generator and the tests. */
export const STEMS: string[] = Object.keys(LINES[VOICE_ID]);

/** The line spoken for a stem, or null if there isn't one. */
export const textFor = (stem: string): string | null =>
  LINES[VOICE_ID][stem]?.[0] ?? null;

/**
 * Where a line's audio lives. Returns null for an unknown stem rather than a
 * 404, so a typo goes quiet at the call site instead of at the network.
 */
export function fileFor(stem: string): string | null {
  return LINES[VOICE_ID][stem] ? `/audio/${VOICE_ID}/${stem}_01.mp3` : null;
}

/** The stems for one night step: what to say waking it, and sending it to bed. */
export const wakeStem = (step: string) => `wake_${step}`;
export const sleepStem = (step: string) => `sleep_${step}`;
