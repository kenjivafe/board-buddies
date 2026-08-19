import {
  BED,
  BED_BAR_SECONDS,
  BED_FIRST_DOWNBEAT,
  BED_LOOP_BARS,
  BED_SEAM_SECONDS,
  DUCK,
  FADE_MS,
  takeOf,
} from "./ambience";

/**
 * The night bed, and the grid everything else lands on.
 *
 * This is Web Audio rather than an `<audio loop>` element, for two reasons that
 * both come down to the same thing: an element cannot be trusted with time.
 *
 * A looping element re-primes its decoder at the wrap, and you hear it — a
 * short hole in the drums once every forty-five seconds, which is exactly the
 * kind of thing you stop noticing and start finding annoying. A decoded buffer
 * wraps sample-accurately.
 *
 * And an element cannot tell you *where in the bar it is*. Once the audio is a
 * buffer on the audio clock, the position is arithmetic, so a role's sting can
 * be scheduled onto a bar line instead of played whenever the queue happens to
 * reach it. A hand drum landing across the beat sounds like a mistake; the same
 * sample on the beat sounds composed.
 *
 * Everything here degrades to silence rather than throwing. There may be no
 * file, the browser may refuse to start an AudioContext, decoding may fail —
 * the night still has to run.
 */
/** A one-shot, and how far into it the sound actually starts. */
interface Clip {
  buffer: AudioBuffer;
  /** seconds of near-silence before the transient */
  lead: number;
}

/**
 * Find the hit.
 *
 * A generated clip does not reliably begin at sample zero — most of the role
 * stings start within a few milliseconds, but one of them sits nearly a
 * seventh of a second in. Starting the *file* on the bar line therefore puts
 * the *sound* wherever the generator felt like leaving it, which defeats the
 * entire point of having a grid. Measured rather than tabulated, because a
 * table of nine offsets is nine numbers that go stale the next time anything
 * is recut.
 */
export function leadIn(buffer: AudioBuffer): number {
  const d = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak <= 0) return 0;
  const floor = peak * 0.08;
  for (let i = 0; i < d.length; i++) {
    if (Math.abs(d[i]) < floor) continue;
    // back off a touch, so the very front of the transient is not clipped off
    return Math.max(0, i / buffer.sampleRate - 0.004);
  }
  return 0;
}

export class NightBed {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private loop: AudioBuffer | null = null;
  private loading: Promise<AudioBuffer | null> | null = null;
  private clips = new Map<string, Promise<Clip | null>>();
  /** the audio-clock time at which buffer position zero played */
  private originAt = 0;
  private ducked = false;
  private running = false;

  /** Created on demand: a context made before a tap is born suspended. */
  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.ctx.destination);
    } catch {
      return null;
    }
    return this.ctx;
  }

  private async decode(url: string): Promise<AudioBuffer | null> {
    const ctx = this.context();
    if (!ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      // a missing sound is silence by design; the files are generated separately
      return null;
    }
  }

  /**
   * Trim the decoded bed to a whole number of bars and blend the seam.
   *
   * The file starts a beat or so before the first downbeat and ends mid-bar,
   * so looping it as it stands puts the splice in the middle of a phrase. Cut
   * to bar lines and the wrap lands where a bar line would have anyway.
   *
   * The two ends still don't meet at the same point on the waveform, which is
   * a step, which is a click. The last few milliseconds are crossfaded into the
   * head to swallow it — inaudible at this length, and much cheaper than trying
   * to hunt for a zero crossing that also happens to be on the beat.
   */
  private cut(raw: AudioBuffer): AudioBuffer {
    const rate = raw.sampleRate;
    const start = Math.round(BED_FIRST_DOWNBEAT * rate);
    const length = Math.round(BED_LOOP_BARS * BED_BAR_SECONDS * rate);
    // if the file is shorter than the analysis says, take what is there
    const usable = Math.min(length, raw.length - start);
    if (usable <= 0) return raw;

    /*
     * The fade is only as long as there is material to fade *with*. The last
     * whole bar can end within a few milliseconds of the end of the file, and
     * a fade window longer than the leftover tail runs out of partner halfway
     * through — which puts a step in the middle of the fix instead of at the
     * seam. Whatever is there is enough: the join is a couple of thousandths
     * out, against transients thirty times bigger.
     */
    const tail = Math.max(0, raw.length - (start + usable));
    const seam = Math.min(Math.round(BED_SEAM_SECONDS * rate), tail, Math.floor(usable / 4));

    const ctx = this.ctx!;
    const cut = ctx.createBuffer(raw.numberOfChannels, usable, rate);
    for (let c = 0; c < raw.numberOfChannels; c++) {
      const from = raw.getChannelData(c);
      const to = cut.getChannelData(c);
      for (let i = 0; i < usable; i++) to[i] = from[start + i];
      // the tail, faded out, laid over the head, faded in
      for (let i = 0; i < seam; i++) {
        const t = i / seam;
        to[i] = to[i] * t + from[start + usable + i] * (1 - t);
      }
    }
    return cut;
  }

  /** Bring the wood up. Safe to call repeatedly; only the first one starts it. */
  async start(gain: number) {
    const ctx = this.context();
    if (!ctx || !this.out) return;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    if (this.running) return;

    if (!this.loop) {
      this.loading ??= this.decode(takeOf(BED)).then((raw) => (raw ? this.cut(raw) : null));
      this.loop = await this.loading;
    }
    if (!this.loop || this.running) return;

    const src = ctx.createBufferSource();
    src.buffer = this.loop;
    src.loop = true;
    src.connect(this.out);
    // a beat of slack, so the first bar line is in the future and not now
    const at = ctx.currentTime + 0.05;
    src.start(at);
    this.source = src;
    this.originAt = at;
    this.running = true;
    this.fade(this.level(gain), FADE_MS);
  }

  private level(gain: number) {
    return this.ducked ? gain * DUCK : gain;
  }

  private fade(to: number, ms: number) {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const g = this.out.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(to, ctx.currentTime + ms / 1000);
  }

  /** Drop the bed back while the moderator is talking, and bring it up after. */
  duck(on: boolean, gain: number) {
    if (this.ducked === on) return;
    this.ducked = on;
    if (this.running) this.fade(this.level(gain), 450);
  }

  /** Take it away. `ms` long, because nothing in a dark room stops abruptly. */
  stop(ms = FADE_MS) {
    if (!this.running || !this.ctx) return;
    const src = this.source;
    this.fade(0, ms);
    this.running = false;
    this.source = null;
    window.setTimeout(() => {
      try {
        src?.stop();
      } catch {
        /* already stopped */
      }
    }, ms + 60);
  }

  get playing() {
    return this.running;
  }

  /**
   * When the next bar line falls, at least `minMs` from now.
   *
   * Returns the delay in ms and the audio-clock time to schedule against, or
   * null when there is no bed to be in time with — muted, still loading, or a
   * browser that would not give us a context. Callers fall back to `minMs`,
   * which is what the night did before any of this existed.
   */
  nextBar(minMs: number): { delayMs: number; at: number } | null {
    const ctx = this.ctx;
    if (!ctx || !this.running) return null;
    const elapsed = ctx.currentTime - this.originAt;
    if (elapsed < 0) return null;
    const earliest = elapsed + minMs / 1000;
    // 1e-6 so a target already exactly on a line isn't pushed a whole bar out
    const at = Math.ceil(earliest / BED_BAR_SECONDS - 1e-6) * BED_BAR_SECONDS;
    return { delayMs: (at - elapsed) * 1000, at: this.originAt + at };
  }

  /**
   * Play a one-shot, optionally at an exact moment on the audio clock.
   *
   * Used for the role stings, which is the whole reason the grid above exists.
   * Falls back to an element when there is no context, so a browser that will
   * not do Web Audio still gets the sound, just not on the beat.
   */
  async hit(url: string, gain: number, at?: number, seconds?: number) {
    const ctx = this.context();
    if (!ctx) {
      try {
        const el = new Audio(url);
        el.volume = gain;
        void el.play().catch(() => {});
        if (seconds !== undefined) window.setTimeout(() => el.pause(), seconds * 1000);
      } catch {
        /* nothing to be done */
      }
      return;
    }
    const clip = await this.clip(url);
    if (!clip) return;
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    // a scheduled time that has already gone by means "now" to start()
    const when = at !== undefined && at > ctx.currentTime ? at : ctx.currentTime;
    // skip the quiet head, so it is the hit that lands on the line, not the file
    src.start(when, clip.lead);

    /*
     * And take only the front of it. The music endpoint will not cut anything
     * as short as two bars, so these are four bars long and the back half is
     * simply not played — released over a fraction of a second rather than
     * chopped, because a buffer that stops mid-waveform is a click.
     */
    if (seconds !== undefined) {
      const RELEASE = 0.28;
      const end = when + seconds;
      g.gain.setValueAtTime(gain, Math.max(ctx.currentTime, end - RELEASE));
      g.gain.linearRampToValueAtTime(0, end);
      src.stop(end + 0.02);
    }
  }

  private clip(url: string): Promise<Clip | null> {
    let pending = this.clips.get(url);
    if (!pending) {
      pending = this.decode(url).then((buffer) =>
        buffer ? { buffer, lead: leadIn(buffer) } : null
      );
      this.clips.set(url, pending);
    }
    return pending;
  }

  /** Get the fetch and decode out of the way before the moment it is needed. */
  warm(url: string) {
    void this.clip(url);
  }

  dispose() {
    this.stop(120);
    window.setTimeout(() => {
      void this.ctx?.close().catch(() => {});
      this.ctx = null;
    }, 250);
  }
}
