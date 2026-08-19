import { NIGHT_ORDER } from "./roles";
import type { NightStep } from "./types";

/**
 * The room tone, as distinct from the moderator's voice.
 *
 * Three layers. A soundtrack that loops under the whole night, a howl dropped
 * in every so often on top of it, and a short sting for each role as it is
 * called — so the table hears *something* happen even before the line starts.
 * A cockerel ends all of it.
 *
 * None of it is generated at runtime; these are files under
 * public/audio/werewolf/ambience, cut by `scripts/generate-sfx.ts`. Every one
 * is optional: a missing file is silence, exactly as with the voice lines.
 */

export interface SoundSpec {
  /** file stem under public/audio/werewolf/ambience */
  stem: string;
  /** the brief handed to the generator */
  prompt: string;
  seconds: number;
  /** 0–1, before any ducking */
  gain: number;
  /** how many takes to cut, so a repeated sound isn't the same take twice */
  variants: number;
  /**
   * Cut as music rather than as a sound effect. The bed is a composed loop
   * with a rhythm to it, which the sound-effects model does not do — it makes
   * atmospheres. Different endpoint, and it can run longer.
   */
  music?: boolean;
}

/**
 * The bed: drums, not weather.
 *
 * The first attempt at this was a forest atmosphere, and it was wallpaper —
 * a night that goes on for five minutes needs a pulse under it, not wind.
 */
export const BED: SoundSpec = {
  stem: "night",
  prompt:
    "Slow hypnotic tribal jungle drums looping steadily — deep low toms, hand percussion and a soft wooden shaker, patient and unhurried at around 70 beats per minute. Underneath, a continuous bed of night crickets and insects in a dark forest. Eerie, mysterious and tense, like a ritual happening somewhere in the trees. Seamless loop, no melody, no vocals, no build, no ending.",
  seconds: 45,
  gain: 0.4,
  variants: 1,
  music: true,
};

/** Laid over the bed at random, so the wood is never quite settled. */
export const HOWL: SoundSpec = {
  stem: "howl",
  prompt:
    "A single distant wolf howl echoing across a valley at night, far away, reverberant, lonely. No music, no other animals.",
  seconds: 5,
  gain: 0.5,
  variants: 3,
};

/** Morning. Cuts the bed off rather than fading with it. */
export const ROOSTER: SoundSpec = {
  stem: "rooster",
  prompt:
    "A single rooster crowing at dawn, close and clear, one crow only. Farmyard morning. No music.",
  seconds: 4,
  gain: 0.6,
  variants: 1,
};

/**
 * One per role, played the moment it is called and before the moderator says
 * a word. They are the reason the table looks up: a sound lands, and whoever
 * it belongs to knows it is them a beat before they are told.
 *
 * Each one is a *thing that role does* rather than a stab of music, so it
 * belongs to the same wood as everything else.
 */
const STING_PROMPTS: Record<NightStep, string> = {
  werewolf:
    "A low guttural wolf growl and snarl, close and threatening, one short burst. No music.",
  minion:
    "A sly conspiratorial whisper and a soft dark chime, brief and secretive. No words, no music.",
  mason:
    "Two stone blocks tapped together and a chisel striking masonry, brief and solid. No music.",
  seer:
    "A soft mystical shimmer, glass crystal ringing and a rising ethereal sparkle, brief. No music.",
  robber:
    "A quiet clink of coins in a leather purse and a soft sneaking footstep on floorboards. No music.",
  witch:
    "A cauldron bubbling and a single glass potion bottle uncorked with a soft pop. No music.",
  troublemaker:
    "A quick mischievous whoosh of two things swapping places, with a light rattling shake. No music.",
  drunk:
    "A glass bottle clinking against a tankard and liquid sloshing, brief and clumsy. No music.",
  insomniac:
    "A slow ticking clock and a wooden bed frame creaking softly in a quiet room. No music.",
};

export const STINGS: SoundSpec[] = NIGHT_ORDER.map((step) => ({
  stem: `sting_${step}`,
  prompt: STING_PROMPTS[step],
  seconds: 3,
  gain: 0.55,
  variants: 1,
}));

export const SOUNDS: SoundSpec[] = [BED, HOWL, ROOSTER, ...STINGS];

/** How long to wait between howls, in ms. Random inside this range. */
export const HOWL_GAP: [number, number] = [22_000, 55_000];

/**
 * How long the sting gets to itself before the moderator speaks over it. Long
 * enough to register as its own event, short enough that the night doesn't
 * stall on a sound effect.
 */
export const STING_LEAD_MS = 1100;

/** The bed drops to this fraction of its gain while the moderator is talking. */
export const DUCK = 0.3;
/** Fade in and out, in ms. Nothing in a dark room should start abruptly. */
export const FADE_MS = 1600;

export const soundFile = (stem: string, variant = 1): string =>
  `/audio/werewolf/ambience/${stem}_${String(variant).padStart(2, "0")}.mp3`;

/** A random take of a sound that was cut in several. */
export const takeOf = (spec: SoundSpec): string =>
  soundFile(spec.stem, 1 + Math.floor(Math.random() * spec.variants));

/** The sound a role arrives on. */
export const stingFile = (step: NightStep): string => soundFile(`sting_${step}`);
export const STING_GAIN = 0.55;
