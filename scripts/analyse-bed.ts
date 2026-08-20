/**
 * Finds the pulse in the night bed, so the loop point and the role stings can
 * be put on a bar line instead of wherever the file happens to end.
 *
 *   npx tsx scripts/analyse-bed.ts
 *
 * Prints the constants that belong in lib/werewolf/ambience.ts. Re-run it if
 * the bed is ever recut — generate-sfx.ts asks for a tempo in the prompt, and
 * the model has honoured it so far, but nothing guarantees that.
 *
 * Deliberately offline. The same numbers could be worked out in the browser at
 * load, but that would be every phone spending real time on DSP to arrive at
 * an answer that does not change.
 *
 * Needs a decoder that is not a dependency of the app:
 *
 *   npm i --no-save mpg123-decoder
 */
import fs from "node:fs";
import path from "node:path";
import { BED, soundFile } from "../lib/werewolf/ambience";

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const FILE = path.join(ROOT, "public", soundFile(BED.stem));

/** frames per analysis hop — 256 samples is ~5.8ms at 44.1k, plenty for drums */
const HOP = 256;
/** the toms and hand drums live below this; the crickets are all above it */
const LOW_HZ = 200;
/** where a jungle bed could plausibly sit */
const BPM_RANGE: [number, number] = [55, 150];

/** as much of mpg123-decoder as this needs; see the import below */
interface Mp3Decoder {
  ready: Promise<unknown>;
  decode(data: Uint8Array): { channelData: Float32Array[]; sampleRate: number };
  free(): void;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`no bed at ${FILE} — run scripts/generate-sfx.ts first`);
    process.exit(1);
  }

  let MPEGDecoder: new () => Mp3Decoder;
  try {
    /*
     * The specifier is a variable on purpose. This package is deliberately not
     * a dependency — it is a wasm decoder wanted once, by hand, to produce
     * numbers that then live in the source. Written as a literal, `tsc` and
     * `next build` both try to resolve its types and fail for everybody who
     * has not installed it, which is everybody.
     */
    const wasm = "mpg123-decoder";
    ({ MPEGDecoder } = (await import(wasm)) as { MPEGDecoder: new () => Mp3Decoder });
  } catch {
    console.error("needs a decoder:  npm i --no-save mpg123-decoder");
    process.exit(1);
  }

  const dec = new MPEGDecoder();
  await dec.ready;
  const { channelData, sampleRate } = dec.decode(new Uint8Array(fs.readFileSync(FILE)));
  dec.free();

  const left = channelData[0];
  const right = channelData[1] ?? left;
  const n = left.length;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (left[i] + right[i]) / 2;
  const seconds = n / sampleRate;

  // ---------- an onset track, which is where the beat actually shows ----------

  const frames = Math.floor(n / HOP);
  const energy = new Float32Array(frames);
  const a = Math.exp((-2 * Math.PI * LOW_HZ) / sampleRate);
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) {
      lp = (1 - a) * mono[i] + a * lp;
      acc += lp * lp;
    }
    energy[f] = Math.sqrt(acc / HOP);
  }
  // rising energy only: a drum hit is a step up, and holding a note is not
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
  let mean = 0;
  for (let f = 0; f < frames; f++) mean += flux[f];
  mean /= frames;
  for (let f = 0; f < frames; f++) flux[f] = Math.max(0, flux[f] - mean);

  const fps = sampleRate / HOP;
  const at = (f: number) => Math.max(flux[f - 1] ?? 0, flux[f] ?? 0, flux[f + 1] ?? 0);

  /** Lay a grid of this period over the onsets at its best phase, and score it. */
  const comb = (period: number) => {
    const lag = period * fps;
    let best = { score: -1, phase: 0 };
    for (let ph = 0; ph < lag; ph += 0.5) {
      let sum = 0;
      let hits = 0;
      for (let k = 0; ; k++) {
        const f = Math.round(ph + k * lag);
        if (f >= frames) break;
        sum += at(f);
        hits++;
      }
      // per grid point, or a fast grid wins simply by having more points
      if (sum / hits > best.score) best = { score: sum / hits, phase: ph / fps };
    }
    return best;
  };

  const swept: { bpm: number; score: number; phase: number }[] = [];
  for (let bpm = BPM_RANGE[0]; bpm <= BPM_RANGE[1]; bpm += 0.2) {
    swept.push({ bpm, ...comb(60 / bpm) });
  }
  const peaks = swept.filter(
    (r, i) =>
      i > 0 &&
      i < swept.length - 1 &&
      r.score >= swept[i - 1].score &&
      r.score > swept[i + 1].score
  );
  peaks.sort((x, y) => y.score - x.score);

  console.log(`${path.relative(ROOT, FILE)} — ${seconds.toFixed(3)}s at ${sampleRate}Hz\n`);
  console.log("strongest pulses:");
  for (const p of peaks.slice(0, 6)) {
    console.log(`  ${p.bpm.toFixed(1).padStart(6)} bpm   ${p.score.toExponential(3)}`);
  }

  /*
   * Take the slowest pulse that is nearly as strong as the strongest. Onsets on
   * every eighth note score just as well at double time, and a bar of eighths
   * is not a bar — this bed peaks at 70 and again at 140 within a percent.
   */
  const top = peaks[0];
  const beatAt = peaks.filter((p) => p.score > top.score * 0.8).sort((x, y) => x.bpm - y.bpm)[0];
  const beat = 60 / beatAt.bpm;

  // ---------- which of the four is the downbeat ----------

  const meter = 4;
  let downbeat = beatAt.phase;
  let bestScore = -1;
  for (let off = 0; off < meter; off++) {
    let sum = 0;
    let hits = 0;
    for (let k = 0; ; k++) {
      const f = Math.round((beatAt.phase + (off + k * meter) * beat) * fps);
      if (f >= frames) break;
      sum += at(f);
      hits++;
    }
    if (sum / hits > bestScore) {
      bestScore = sum / hits;
      downbeat = beatAt.phase + off * beat;
    }
  }

  const bar = beat * meter;
  const bars = Math.floor((seconds - downbeat) / bar + 1e-6);
  const loopEnd = downbeat + bars * bar;

  console.log(`\ntaking ${beatAt.bpm.toFixed(1)} bpm as the beat (strongest was ${top.bpm.toFixed(1)})`);
  console.log(`bar ${bar.toFixed(4)}s, first downbeat ${downbeat.toFixed(4)}s`);
  console.log(
    `${bars} whole bars fit: loop ${downbeat.toFixed(4)}..${loopEnd.toFixed(4)}, ` +
      `dropping ${(seconds - loopEnd).toFixed(4)}s off the end\n`
  );
  // ---------- and what key it is in, for the stings to be written against ----------

  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  /** Goertzel: the energy at one exact frequency, without a whole FFT. */
  const power = (freq: number, from: number, len: number) => {
    const k = (2 * Math.PI * freq) / sampleRate;
    const c = 2 * Math.cos(k);
    let s1 = 0;
    let s2 = 0;
    for (let i = from; i < from + len; i++) {
      const s0 = mono[i] + c * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  };

  const WIN = sampleRate * 2;
  const windows: number[] = [];
  for (let s = 0; s + WIN < n; s += WIN * 2) windows.push(s);

  const chroma = new Array(12).fill(0);
  let root = { midi: 0, energy: -1 };
  for (let midi = 24; midi <= 72; midi++) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    if (f < 30 || f > 900) continue;
    let e = 0;
    for (const s of windows) e += Math.sqrt(Math.max(0, power(f, s, WIN)));
    chroma[midi % 12] += e;
    // the lowest register is where a tom's fundamental actually is
    if (midi <= 55 && e > root.energy) root = { midi, energy: e };
  }
  const total = chroma.reduce((a: number, b: number) => a + b, 0);
  const ranked = chroma
    .map((v: number, i: number) => ({ note: NAMES[i], share: v / total }))
    .sort((x: { share: number }, y: { share: number }) => y.share - x.share);

  console.log("pitch classes by energy:");
  for (const r of ranked.slice(0, 4)) console.log(`  ${r.note.padEnd(3)} ${(r.share * 100).toFixed(1)}%`);
  const third = ranked.findIndex((r: { note: string }) => r.note === NAMES[(root.midi + 3) % 12]);
  const majThird = ranked.findIndex((r: { note: string }) => r.note === NAMES[(root.midi + 4) % 12]);
  const quality = third <= majThird ? "minor" : "major";
  console.log(
    `\nstrongest low fundamental ${NAMES[root.midi % 12]}${Math.floor(root.midi / 12) - 1} ` +
      `(${(440 * Math.pow(2, (root.midi - 69) / 12)).toFixed(1)} Hz), ` +
      `${quality} third the stronger of the two\n`
  );

  console.log("for lib/werewolf/ambience.ts:");
  console.log(`  export const BED_BPM = ${Number(beatAt.bpm.toFixed(1))};`);
  console.log(`  export const BED_FIRST_DOWNBEAT = ${Number(downbeat.toFixed(4))};`);
  console.log(`  export const BED_LOOP_BARS = ${bars};`);
  console.log(`  export const BED_KEY = "${NAMES[root.midi % 12]} ${quality}";`);
  console.log(
    `  export const BED_ROOT_HZ = ${(440 * Math.pow(2, (root.midi - 69) / 12)).toFixed(2)};`
  );
}

void main();
