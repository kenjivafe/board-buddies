/**
 * Synthesises every voice line in the game manifests into public/audio/.
 *
 *   npx tsx scripts/generate-voices.ts           # only what is missing
 *   npx tsx scripts/generate-voices.ts --dry     # cost estimate, no API calls
 *   npx tsx scripts/generate-voices.ts --force   # re-record everything
 *   npx tsx scripts/generate-voices.ts --voices  # design a fresh cast first
 *
 * Needs ELEVENLABS_API_KEY in .env — the key itself, which starts with `sk_`
 * and is shown only once when you create it. The value listed beside a key in
 * the dashboard is its ID, not the key, and will be rejected.
 *
 * Voice ids are cached in public/audio/voices.json so reruns reuse the same
 * cast. Delete that file (or pass --voices) to design a new one.
 *
 * A voice id doubles as its folder under public/audio, so a game that would
 * otherwise collide namespaces itself: Coup's narrator is `narrator`, and
 * Werewolf's is `werewolf/moderator`.
 */
import fs from "node:fs";
import path from "node:path";
import { LINES as coupLines, VOICES as coupVoices } from "../lib/coup/voice";
import { LINES as wwLines, VOICES as wwVoices } from "../lib/werewolf/voice";

interface Profile {
  id: string;
  description: string;
  /** what the designer reads back while auditioning; falls back to Coup's */
  preview?: string;
  /** an existing voice to use as-is, instead of designing one */
  voiceId?: string;
  /** 0.7–1.2, passed straight through to the synthesiser */
  speed?: number;
}

const VOICES: Profile[] = [...coupVoices, ...wwVoices];
const LINES: Record<string, Record<string, string[]>> = { ...coupLines, ...wwLines };

const DEFAULT_PREVIEW =
  "The court does not forgive carelessness. Every claim invites a challenge, and every challenge has a price. Consider carefully before you speak.";

/** "werewolf/moderator" → "Werewolf Moderator", for the name upstream. */
const label = (id: string) =>
  id
    .split("/")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const OUT = path.join(ROOT, "public", "audio");
const CAST_FILE = path.join(OUT, "voices.json");
const API = "https://api.elevenlabs.io/v1";
const MODEL = "eleven_multilingual_v2";

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const DRY = args.has("--dry");
const DESIGN = args.has("--voices");
/** --redo=assassin,duke — recast those voices and re-record only their lines */
const REDO = Array.from(args)
  .filter((a) => a.startsWith("--redo="))
  .flatMap((a) => a.slice("--redo=".length).split(",").map((s: string) => s.trim()))
  .filter(Boolean);

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
    }
  }
}
loadEnv();

const KEY = process.env.ELEVENLABS_API_KEY ?? "";
const headers = { "xi-api-key": KEY, "Content-Type": "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(url: string, init: RequestInit, tries = 5): Promise<Response> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const body = await res.text();
      // 429 is a rate limit worth waiting out; anything else should fail loudly
      if (res.status !== 429 || attempt === tries) {
        throw new Error(`${res.status} ${url}\n${body.slice(0, 300)}`);
      }
    } catch (error) {
      // a dropped connection mid-run shouldn't cost the whole batch — files
      // already written are kept, and a rerun resumes from where it stopped
      const network = error instanceof TypeError || (error as Error).message === "fetch failed";
      if (!network || attempt === tries) throw error;
      console.log(`    connection lost, retrying (${attempt}/${tries})…`);
    }
    await sleep(attempt * 2000);
  }
  throw new Error("unreachable");
}

/**
 * Recasting a voice: delete it upstream, forget its id, and bin its clips so
 * the normal run redesigns it and re-records only those lines.
 */
async function redo(names: string[], cast: Record<string, string>) {
  for (const id of names) {
    if (!VOICES.some((v) => v.id === id)) throw new Error(`unknown voice "${id}"`);
    const voiceId = cast[id];
    if (voiceId) {
      try {
        await api(`${API}/voices/${voiceId}`, { method: "DELETE", headers });
        console.log(`  deleted ${id} (${voiceId})`);
      } catch (error) {
        console.log(`  could not delete ${id} upstream: ${(error as Error).message.split("\n")[0]}`);
      }
      delete cast[id];
    }
    const dir = path.join(OUT, id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`  cleared public/audio/${id}/`);
    }
  }
  fs.writeFileSync(CAST_FILE, JSON.stringify(cast, null, 2));
}

async function designCast(only?: string[]): Promise<Record<string, string>> {
  const cast: Record<string, string> = fs.existsSync(CAST_FILE)
    ? (JSON.parse(fs.readFileSync(CAST_FILE, "utf8")) as Record<string, string>)
    : {};
  for (const voice of VOICES.filter((v) => (only ? only.includes(v.id) : !cast[v.id]))) {
    // a pinned voice is somebody's own, already on the account: use it, don't
    // design over it, and never delete it
    if (voice.voiceId) {
      cast[voice.id] = voice.voiceId;
      console.log(`  ${voice.id} is pinned to ${voice.voiceId}`);
      continue;
    }
    console.log(`  designing ${voice.id}…`);
    const previewRes = await api(`${API}/text-to-voice/create-previews`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        voice_description: voice.description,
        // long enough for the designer to show real character
        text: voice.preview ?? DEFAULT_PREVIEW,
      }),
    });
    const { previews } = (await previewRes.json()) as {
      previews: { generated_voice_id: string }[];
    };
    const madeRes = await api(`${API}/text-to-voice/create-voice-from-preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        voice_name: `Board Buddies ${label(voice.id)}`,
        voice_description: voice.description,
        generated_voice_id: previews[0].generated_voice_id,
      }),
    });
    const made = (await madeRes.json()) as { voice_id: string };
    cast[voice.id] = made.voice_id;
    console.log(`    → ${made.voice_id}`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CAST_FILE, JSON.stringify(cast, null, 2));
  return cast;
}

interface Job {
  voiceId: string;
  file: string;
  text: string;
  speed?: number;
}

const speedOf = (id: string) => VOICES.find((v) => v.id === id)?.speed;

async function main() {
  const jobs: Job[] = [];
  for (const [voiceId, groups] of Object.entries(LINES)) {
    for (const [stem, texts] of Object.entries(groups)) {
      texts.forEach((text, i) => {
        const variant = String(i + 1).padStart(2, "0");
        jobs.push({
          voiceId,
          text,
          speed: speedOf(voiceId),
          file: path.join(OUT, voiceId, `${stem}_${variant}.mp3`),
        });
      });
    }
  }

  const pending = () => (FORCE ? jobs : jobs.filter((j) => !fs.existsSync(j.file)));
  console.log(
    `${jobs.length} lines in the manifest, ${pending().length} to generate, ~${pending().reduce((n, j) => n + j.text.length, 0)} characters.`
  );

  if (DRY) {
    const byVoice = jobs.reduce<Record<string, number>>((acc, j) => {
      acc[j.voiceId] = (acc[j.voiceId] ?? 0) + 1;
      return acc;
    }, {});
    for (const [voice, n] of Object.entries(byVoice)) console.log(`  ${voice.padEnd(12)} ${n}`);
    return;
  }

  if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set (looked in .env.local, then .env)");
  if (!KEY.startsWith("sk_")) {
    throw new Error(
      "That value looks like an API key ID rather than the key itself.\n" +
        "ElevenLabs keys start with 'sk_' and are shown only once, when you create the key.\n" +
        "Create a new key and paste that value into .env as ELEVENLABS_API_KEY."
    );
  }

  let cast: Record<string, string> = fs.existsSync(CAST_FILE)
    ? (JSON.parse(fs.readFileSync(CAST_FILE, "utf8")) as Record<string, string>)
    : {};

  if (REDO.length > 0) {
    console.log(`Recasting ${REDO.join(", ")}…`);
    await redo(REDO, cast);
  }

  const uncast = VOICES.filter((v) => !cast[v.id]).map((v) => v.id);
  if (DESIGN || uncast.length > 0) {
    console.log(`Designing ${DESIGN ? "the whole cast" : uncast.join(", ")}…`);
    cast = await designCast(DESIGN ? VOICES.map((v) => v.id) : uncast);
  }

  // Recomputed here, deliberately: --redo deletes files, and taking this list
  // before that ran meant everything it deleted was skipped and never rebuilt.
  const todo = pending();
  if (todo.length === 0) {
    console.log("Nothing to generate — every line is already recorded.");
    return;
  }

  let done = 0;
  for (const job of todo) {
    const voiceId = cast[job.voiceId];
    if (!voiceId) throw new Error(`no voice designed for ${job.voiceId}`);
    const res = await api(`${API}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { ...headers, Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: job.text,
        model_id: MODEL,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.25,
          // omitted rather than defaulted, so Coup's existing takes are
          // reproducible byte-for-byte against the settings they were cut with
          ...(job.speed ? { speed: job.speed } : {}),
        },
      }),
    });
    fs.mkdirSync(path.dirname(job.file), { recursive: true });
    fs.writeFileSync(job.file, Buffer.from(await res.arrayBuffer()));
    done += 1;
    console.log(`  [${done}/${todo.length}] ${path.relative(ROOT, job.file)}`);
    await sleep(250);
  }
  console.log(`\nDone. ${done} files under public/audio/.`);
}

main().catch((error: Error) => {
  console.error("\n" + error.message);
  process.exit(1);
});
