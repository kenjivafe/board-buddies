/**
 * Cuts the room tone for One Night Werewolf into
 * public/audio/werewolf/ambience/ — the night bed, the wolf howls, and the
 * cockerel that ends it.
 *
 *   npx tsx scripts/generate-sfx.ts          # only what is missing
 *   npx tsx scripts/generate-sfx.ts --dry    # what it would cut, no API calls
 *   npx tsx scripts/generate-sfx.ts --force  # cut everything again
 *
 * Separate from generate-voices.ts on purpose: this hits ElevenLabs' sound
 * effects endpoint rather than text-to-speech, which is a **different API key
 * permission**. A key that happily reads the script will get a 401 here unless
 * `sound_generation` is enabled on it.
 *
 * Everything it makes is optional. The game treats a missing file as silence,
 * so it plays fine before this has ever been run.
 */
import fs from "node:fs";
import path from "node:path";
import { SOUNDS, soundFile } from "../lib/werewolf/ambience";

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const OUT = path.join(ROOT, "public");
/** atmospheres and one-shots */
const SFX_API = "https://api.elevenlabs.io/v1/sound-generation";
/** the bed, which is a composed loop with a rhythm and needs the other model */
const MUSIC_API = "https://api.elevenlabs.io/v1/music";

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const DRY = args.has("--dry");

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Job {
  file: string;
  prompt: string;
  seconds: number;
  label: string;
  music: boolean;
}

async function main() {
  const jobs: Job[] = [];
  for (const spec of SOUNDS) {
    for (let v = 1; v <= spec.variants; v++) {
      const rel = soundFile(spec.stem, v);
      jobs.push({
        file: path.join(OUT, rel),
        prompt: spec.prompt,
        seconds: spec.seconds,
        label: rel,
        music: Boolean(spec.music),
      });
    }
  }

  const todo = FORCE ? jobs : jobs.filter((j) => !fs.existsSync(j.file));
  const seconds = todo.reduce((n, j) => n + j.seconds, 0);
  console.log(
    `${jobs.length} sounds in the manifest, ${todo.length} to cut, ~${seconds}s of audio.`
  );

  if (DRY) {
    for (const j of todo) {
      console.log(
        `  ${j.label.padEnd(42)} ${String(j.seconds).padStart(2)}s ${j.music ? "music" : "sfx  "}  "${j.prompt.slice(0, 50)}…"`
      );
    }
    return;
  }
  if (todo.length === 0) {
    console.log("Nothing to cut — every sound is already there.");
    return;
  }
  if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set (looked in .env.local, then .env)");

  let done = 0;
  for (const job of todo) {
    const res = await fetch(job.music ? MUSIC_API : SFX_API, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(
        job.music
          ? { prompt: job.prompt, music_length_ms: job.seconds * 1000 }
          : {
              text: job.prompt,
              duration_seconds: job.seconds,
              // high enough that the brief is followed rather than interpreted
              prompt_influence: 0.45,
            }
      ),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401) {
        throw new Error(
          `This API key cannot generate ${job.music ? "music" : "sound effects"}.\n` +
            "The voice lines only need text-to-speech, so a key cut for those will\n" +
            "fail here — this needs the sound_generation permission, and music can\n" +
            "be gated separately by plan. Check elevenlabs.io → API keys.\n\n" +
            body.slice(0, 200)
        );
      }
      throw new Error(`${res.status} ${job.label}\n${body.slice(0, 300)}`);
    }

    fs.mkdirSync(path.dirname(job.file), { recursive: true });
    fs.writeFileSync(job.file, Buffer.from(await res.arrayBuffer()));
    done += 1;
    console.log(`  [${done}/${todo.length}] ${job.label}`);
    await sleep(400);
  }
  console.log(`\nDone. ${done} files under public/audio/werewolf/ambience/.`);
}

main().catch((error: Error) => {
  console.error("\n" + error.message);
  process.exit(1);
});
