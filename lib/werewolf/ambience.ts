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

export interface Retake {
  prompt: string;
  /** cut as music rather than as a sound effect; see `SoundSpec.music` */
  music?: boolean;
  /** override the spec's length for this take alone */
  seconds?: number;
}

export interface SoundSpec {
  /** file stem under public/audio/werewolf/ambience */
  stem: string;
  /** the brief handed to the generator */
  prompt: string;
  /**
   * Later takes, where a take is a different idea rather than another roll of
   * the same one. `retakes[0]` is take 2, and anything past the end falls back
   * to `prompt`. A take can pick its own endpoint and length, because "the
   * same sound, done differently" often means a different model entirely.
   *
   * The stings use this, and every take stays on disk: which one the game
   * plays is one constant away.
   */
  retakes?: Retake[];
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

/**
 * The bed's pulse, measured from the file rather than assumed from the prompt.
 *
 * `scripts/analyse-bed.ts` decodes night_01.mp3, builds a low-band onset track
 * and combs it for the strongest steady pulse. It came back at exactly 70.0 bpm
 * with the first downbeat 0.4615s in — the model took the tempo in the prompt
 * literally, which is the only reason any of the rest of this is possible.
 *
 * Two things are built on it. The bed loops on a bar line instead of at the end
 * of the file, so the seam lands where a bar would have anyway; and each role's
 * sting is scheduled onto the grid rather than whenever the queue reaches it,
 * so it drops on the beat instead of across it.
 *
 * Re-run the script if the bed is ever recut. Nothing breaks if these drift —
 * the seam just stops landing on a bar — but it stops being worth the trouble.
 */
export const BED_BPM = 70;
export const BED_BEAT_SECONDS = 60 / BED_BPM;
/** 4/4, per the analysis: the downbeat comb scored highest at four. */
export const BED_BAR_SECONDS = BED_BEAT_SECONDS * 4;
/** Where the first downbeat sits in the decoded file. */
export const BED_FIRST_DOWNBEAT = 0.4615;
/** Whole bars between that downbeat and the end of the file. */
export const BED_LOOP_BARS = 13;
/**
 * The splice is on a bar line but not on a zero crossing, so the two ends are
 * blended to keep it from clicking. A maximum, not a promise: the fade can only
 * be as long as the material left over past the last whole bar, which for the
 * current cut is about two milliseconds. That is still ample — the join is
 * three thousandths out against transients thirty times bigger.
 */
export const BED_SEAM_SECONDS = 0.02;

/**
 * The bed's key, measured the same way as its tempo.
 *
 * `scripts/analyse-bed.ts` sums a chroma over the whole loop: C# takes a
 * quarter of the energy on its own and the strongest low fundamental is C#3 at
 * 138.6Hz, with the minor third above the major. Toms smear across neighbouring
 * pitch classes, so this is "the drums sit around C#" rather than a key
 * signature — but it is enough to write a brief against.
 */
export const BED_KEY = "C# minor";
export const BED_ROOT_HZ = 138.59;

/**
 * Take two: the same event, written to the room.
 *
 * The first set are sound effects that happen to be playing while music is on.
 * These ask for one hit, on the downbeat, at the bed's tempo and in its key —
 * so the sting reads as part of the track rather than as something dropped on
 * top of it. The role still has to be recognisable from its own sound, which
 * is the whole point of having one, so the character comes first in every
 * brief and the tuning comes after.
 *
 * In the end one hit was too little: right key, right beat, and still just a
 * noise. See PHRASE_PROMPTS.
 */
const TONAL_PROMPTS: Record<NightStep, string> = {
  werewolf:
    "One low guttural wolf growl over a single deep tom hit tuned to C#, landing together on the downbeat. Dark, threatening, tight decay. Tempo 70 BPM, key C# minor. One hit only, no loop, no melody, no music bed.",
  minion:
    "One conspiratorial whisper over a soft muted low drum and a dark tuned bell in C# minor, struck once on the downbeat. Secretive and close, short tail. Tempo 70 BPM. No words, no loop, no melody.",
  mason:
    "Two stone blocks struck together on the beat over a low wooden tom tuned to C#, a tight two-hit figure on the downbeat. Solid and dry. Tempo 70 BPM, key C# minor. No loop, no melody.",
  seer:
    "A soft mystical shimmer of glass and crystal ringing on a C# minor chord, struck once on the downbeat over a quiet low tom. Ethereal, rising, short tail. Tempo 70 BPM. No loop, no melody, no vocals.",
  robber:
    "A quick clink of coins in a leather purse over a muted low tom tuned to C#, one hit on the downbeat with a sneaking footstep behind it. Furtive, dry, tight decay. Tempo 70 BPM, key C# minor. No loop, no melody.",
  witch:
    "A cauldron bubbling and one glass bottle uncorked over a low tom tuned to C# and a dark tuned chime in C# minor, on the downbeat. Eerie and close, short tail. Tempo 70 BPM. No loop, no melody.",
  troublemaker:
    "A mischievous whoosh of two things swapping places over two quick hand drum hits tuned to C#, landing on the downbeat with a light rattle. Playful and dry. Tempo 70 BPM, key C# minor. No loop, no melody.",
  drunk:
    "A glass bottle clinking against a tankard over a loose low tom tuned to C#, one clumsy hit on the downbeat with liquid sloshing. Dry, short tail. Tempo 70 BPM, key C# minor. No loop, no melody.",
  insomniac:
    "A slow ticking clock and a wooden bed frame creaking over one soft low tom tuned to C# on the downbeat, with a faint dark drone in C# minor. Quiet and still, short tail. Tempo 70 BPM. No loop, no melody.",
};

/**
 * How long a role's figure runs: four bars at the bed's tempo.
 *
 * Two, at first, with the back half of the generated file thrown away. Four
 * once the figures got their accents — the pattern is one accent a bar and it
 * wants to come round four times, which is the whole file and is what the
 * music endpoint was asked for anyway.
 *
 * It outlasts the call by a long way, on purpose: the line is about two and a
 * half seconds and this is nearly fourteen, so the role's motif plays under
 * the room while they take their turn. A figure still going when the next role
 * is called is stopped by that call — see NightBed.hit.
 */
export const STING_BARS = 4;
export const STING_BAR_SECONDS = BED_BAR_SECONDS;
export const STING_BEATS = STING_BARS * 4;
export const STING_SECONDS = STING_BARS * BED_BAR_SECONDS;

/**
 * Take three: a phrase, not a noise.
 *
 * Takes one and two were both a single event — right key, right beat, and
 * still just a sound going off. What the reference videos actually do is play
 * a short *figure* over the call, which is what makes the role feel announced
 * rather than pinged.
 *
 * So: eight quarter notes across two bars at the bed's tempo, starting on the
 * downbeat the call is already quantised to, in the bed's key. The role's own
 * sound is what the figure is built out of — the Masons' stone on stone, the
 * Robber's coins — rather than an instrument playing near it, because the
 * whole reason a sting works is that you know whose it is before you are told.
 *
 * It runs on past the line, on purpose. The line is about two and a half
 * seconds and the figure is nearly seven, so the last bar plays under the room
 * while whoever was called is picking the phone up.
 */
const PHRASE_PROMPTS: Record<NightStep, string> = {
  werewolf:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight hits on the quarter note, the first landing hard on the downbeat. Deep toms tuned to C# with low guttural wolf growls and snarls answering them between the hits. Dark, prowling, threatening. Dry and close, no reverb wash, no melody, no vocals, no fade in.",
  minion:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight beats, starting on the downbeat. Soft muted low drums with a dark tuned bell and sly conspiratorial whispers weaving between them. Secretive, creeping, hushed. No words, no melody, no fade in.",
  mason:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight quarter-note hits from the downbeat. Stone blocks struck together and a chisel on masonry, in a steady working rhythm over a low tom tuned to C#. Solid, dry, purposeful. No melody, no fade in.",
  seer:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight beats from the downbeat. Glass and crystal struck in a rising pattern over a quiet low tom, shimmering and ethereal, arpeggiating a C# minor chord. Mystical and clear. No vocals, no melody line, no fade in.",
  robber:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight quarter notes from the downbeat. Coins clinking in a leather purse and sneaking footsteps on floorboards in a steady furtive rhythm over a muted low tom tuned to C#. Dry, light-footed, tense. No melody, no fade in.",
  witch:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight beats from the downbeat. A bubbling cauldron and glass bottles struck and uncorked in rhythm over a low tom tuned to C#, with a dark tuned chime. Eerie, brewing, close. No melody, no vocals, no fade in.",
  troublemaker:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight quarter notes from the downbeat. Quick hand drums tuned to C# with mischievous whooshes and light rattles of things swapping places between the hits. Playful, sly, dry. No melody, no fade in.",
  drunk:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight beats from the downbeat, slightly loose and lurching. Glass bottles clinking against tankards and liquid sloshing over a loose low tom tuned to C#. Clumsy, woozy, dry. No melody, no vocals, no fade in.",
  insomniac:
    "A two-bar rhythmic figure at 70 BPM in C# minor, eight quiet beats from the downbeat. A ticking clock keeping the pulse over soft low toms tuned to C# and a faint dark drone, with a wooden bed frame creaking. Still, sleepless, restrained. No melody, no vocals, no fade in.",
};

/**
 * Take four: the same brief, on the model that can actually count.
 *
 * Take three asked the sound-effects endpoint for a figure at 70 BPM and got
 * nine different answers — a few landed on eighth notes, one came back with
 * three hits and stopped after two seconds. That endpoint makes atmospheres;
 * it has no idea what a bar is.
 *
 * The bed does, because the bed was cut on `/v1/music`, and it honoured the
 * tempo in its prompt to the decimal. So these go there too. The trade is that
 * a music model writes music: the role's own sound survives as the character
 * of the percussion rather than as a literal growl, which is a real loss, and
 * the reason take three is still on disk to go back to.
 */
const COMPOSED_PROMPTS: Record<NightStep, string> = {
  werewolf:
    "Two bars of dark tribal percussion at exactly 70 BPM in C# minor, eight quarter-note hits starting on the downbeat. Deep toms tuned to C#, snarling low brass stabs, menacing and predatory. Starts immediately on beat one, no intro, no fade in, no vocals.",
  minion:
    "Two bars of hushed conspiratorial percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. Muted low drums, a dark tuned bell, sly and secretive. Starts immediately on beat one, no intro, no fade in, no vocals.",
  mason:
    "Two bars of hard stone-on-stone percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. Struck rock, wood blocks and a low tom tuned to C#, solid and working. Starts immediately on beat one, no intro, no fade in, no vocals.",
  seer:
    "Two bars of mystical percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. Crystal bells and glass arpeggiating a C# minor chord over a quiet low tom, shimmering and clairvoyant. Starts immediately on beat one, no intro, no fade in, no vocals.",
  robber:
    "Two bars of furtive percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. Coin-like metallic clinks and light hand drums over a muted low tom tuned to C#, sneaking and tense. Starts immediately on beat one, no intro, no fade in, no vocals.",
  witch:
    "Two bars of eerie percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. Struck glass, a dark tuned chime and a bubbling low tom tuned to C#, brewing and unsettling. Starts immediately on beat one, no intro, no fade in, no vocals.",
  troublemaker:
    "Two bars of playful mischievous percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. Quick hand drums tuned to C#, rattles and shakers, sly and light-footed. Starts immediately on beat one, no intro, no fade in, no vocals.",
  drunk:
    "Two bars of loose lurching percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. Clinking glass, a sloppy low tom tuned to C#, woozy and off-balance but in time. Starts immediately on beat one, no intro, no fade in, no vocals.",
  insomniac:
    "Two bars of quiet restless percussion at exactly 70 BPM in C# minor, eight quarter notes from the downbeat. A ticking clock keeping the pulse over soft low toms tuned to C# and a faint dark drone, still and sleepless. Starts immediately on beat one, no intro, no fade in, no vocals.",
};

export const STINGS: SoundSpec[] = NIGHT_ORDER.map((step) => ({
  stem: `sting_${step}`,
  prompt: STING_PROMPTS[step],
  retakes: [
    { prompt: TONAL_PROMPTS[step] },
    { prompt: PHRASE_PROMPTS[step] },
    // the music endpoint has a floor on length, so this is four bars asked for
    // and two bars used — the figure repeats, and only the front of it plays
    { prompt: COMPOSED_PROMPTS[step], music: true, seconds: STING_BAR_SECONDS * 4 },
  ],
  // long enough for the figure and a little air after it
  seconds: Math.ceil(STING_SECONDS) + 1,
  gain: 0.55,
  variants: 4,
}));

/** A sound laid over a role's figure, on named beats of it. */
export interface StingLayer {
  file: string;
  /** which beats of the figure it lands on, counting the first as 0 */
  beats: number[];
  gain: number;
}

/** The third beat of each of the four bars: one, two, *there*, four. */
const THIRD_OF_EACH_BAR = [2, 6, 10, 14];
/** The same, every other bar, for a sound too long to come round that often. */
const THIRD_OF_EVERY_OTHER_BAR = [2, 10];

/**
 * The role's own sound, put back on top of its figure.
 *
 * The composed figures hold time, which is what they were for, but a music
 * model writes music — the Robber's coins came back as "metallic percussion"
 * and the Masons' stone as "a hard hit". The thing that made the first set
 * worth having was that you knew whose it was before you were told, and that
 * was the thing the fourth set lost.
 *
 * So both. The figure carries the rhythm and the key, and take one of the same
 * sting is dropped on the third beat of every bar as the accent — the literal
 * coins, the literal stone. Scheduled against the same audio clock as the bed
 * and the figure, so it lands on the beat rather than near it.
 */
export const stingLayers = (step: NightStep): StingLayer[] =>
  step === "werewolf"
    ? [
        /*
         * The wolf is the exception, and gets a shape rather than a pulse: a
         * howl over the first half, and then the growl twice in the second.
         * It is the one call the whole table is listening for, and something
         * arriving late in it is worth more than another accent on the grid.
         */
        { file: soundFile(HOWL.stem, 3), beats: [0], gain: 0.5 },
        { file: soundFile("sting_werewolf", 1), beats: [10, 14], gain: 0.6 },
      ]
    : [
        {
          file: soundFile(`sting_${step}`, 1),
          // the Witch's cauldron is a long bubbling thing rather than a hit,
          // and four to the bar ran into itself
          beats: step === "witch" ? THIRD_OF_EVERY_OTHER_BAR : THIRD_OF_EACH_BAR,
          gain: 0.6,
        },
      ];

/**
 * Which take of the stings the night plays.
 *
 * Every set stays on disk. Take 1 is the plain sound effect, take 2 is the
 * same single event in the bed's key and tempo, take 3 is a two-bar figure
 * asked of the sound-effects model, take 4 is that figure asked of the music
 * model instead — which is the one that can actually hold a tempo. Moving
 * between them is this line and nothing else, which is the only sane way to
 * judge a change you can only evaluate by ear.
 */
export const STING_TAKE = 4;

/**
 * "It is you." Played on your own device when the night reaches you.
 *
 * Deliberately the SAME sound for every role, and deliberately not the role
 * sting: at a table, a wolf growl coming out of somebody's pocket tells the
 * neighbours exactly what they were dealt. This says only that a phone wants
 * its owner.
 */
export const WAKE_CUE: SoundSpec = {
  stem: "your_turn",
  prompt:
    "A single soft clear bell chime, warm and gentle, one strike with a short tail. Neutral and calm, like a notification. No music, no melody.",
  seconds: 2,
  gain: 0.7,
  variants: 1,
};

export const SOUNDS: SoundSpec[] = [BED, HOWL, ROOSTER, WAKE_CUE, ...STINGS];

/** How long to wait between howls, in ms. Random inside this range. */
export const HOWL_GAP: [number, number] = [22_000, 55_000];


/**
 * The bed drops to this fraction of its gain while the moderator is talking.
 *
 * It used to go to a third, from when the only thing over it was a voice.
 * The role figures are now in its key and on its grid, so dropping the bed
 * that far took the floor out from under them — they are meant to be a layer
 * on the track, not a replacement for it. Half is enough to keep the line
 * clear, and the bed comes back up for the rest of the figure anyway.
 */
export const DUCK = 0.5;
/** Fade in and out, in ms. Nothing in a dark room should start abruptly. */
export const FADE_MS = 1600;

export const soundFile = (stem: string, variant = 1): string =>
  `/audio/werewolf/ambience/${stem}_${String(variant).padStart(2, "0")}.mp3`;

/** A random take of a sound that was cut in several. */
export const takeOf = (spec: SoundSpec): string =>
  soundFile(spec.stem, 1 + Math.floor(Math.random() * spec.variants));

/** Everything the generator needs for one take of one sound. */
export const briefFor = (
  spec: SoundSpec,
  variant: number
): { prompt: string; music: boolean; seconds: number } => {
  const retake = variant === 1 ? undefined : spec.retakes?.[variant - 2];
  return {
    prompt: retake?.prompt ?? spec.prompt,
    music: retake?.music ?? Boolean(spec.music),
    seconds: retake?.seconds ?? spec.seconds,
  };
};

/** The neutral "your phone wants you" chime. */
export const wakeFile = (): string => soundFile(WAKE_CUE.stem);

/** How long the phone buzzes when the night reaches you, in ms. */
export const WAKE_BUZZ: number[] = [180, 90, 180];

/** The sound a role arrives on. */
export const stingFile = (step: NightStep): string =>
  soundFile(`sting_${step}`, STING_TAKE);
export const STING_GAIN = 0.55;
