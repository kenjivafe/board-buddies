/**
 * The voice-line matrix: for every influence-based action, both honest and
 * bluffed, challenged and not.
 *
 * The rule under test throughout — a face-down influence is covered by the
 * narrator, and a character speaks only once its card has genuinely been turned
 * face up.
 */
import fs from "node:fs";
import path from "node:path";
import { initialState, reducer } from "./lib/coup/reducer";
import { CHARACTERS } from "./lib/coup/deck";
import type { ActionKind, Character, CoupState } from "./lib/coup/types";
import { freshCues, primeFrom, VARIANTS, LINES as coupLinesFor } from "./lib/coup/voice";
import { NIGHT_ORDER } from "./lib/werewolf/roles";
import {
  BED,
  DUCK,
  HOWL,
  HOWL_GAP,
  SOUNDS,
  STING_LEAD_MS,
  soundFile,
  wakeFile,
  stingFile,
  takeOf,
} from "./lib/werewolf/ambience";
import { CALL, DAWN, OPENING, SLEEP, WAKE, shown } from "./lib/werewolf/narration";
import {
  STEMS,
  VOICE_ID,
  VOICES as wwVoices,
  fileFor,
  sleepStem,
  textFor,
  wakeStem,
} from "./lib/werewolf/voice";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

const roster = ["Ana", "Ben", "Cleo"].map((name, i) => ({ id: `p${i}`, name }));

function game(): CoupState {
  let s = reducer(initialState(), { type: "START", players: roster });
  while (s.phase === "deal") s = reducer(s, { type: "DEAL_NEXT" });
  return s;
}

function hand(s: CoupState, id: string, ...cs: Character[]): CoupState {
  const next: CoupState = JSON.parse(JSON.stringify(s));
  next.players.find((p) => p.id === id)!.cards = cs.map((character, i) => ({
    id: `${id}-${i}`,
    character,
    revealed: false,
  }));
  return next;
}

const paths = (s: CoupState) => s.cues.map((c) => c.path);
const spokeAnyCharacter = (s: CoupState) =>
  paths(s).filter((p) => CHARACTERS.some((c) => p.startsWith(`${c}/`)));

/** Walks past any prompt so an action reaches its conclusion. */
function settle(s: CoupState): CoupState {
  let guard = 0;
  while (guard++ < 12) {
    if (s.phase === "reveal") {
      const who = s.players.find((p) => p.id === s.reveal!.playerId)!;
      const card = who.cards.find((c) => !c.revealed)!;
      s = reducer(s, { type: "LOSE", cardId: card.id });
    } else if (s.phase === "exchange") {
      const actor = s.players.find((p) => p.id === s.pending!.actorId)!;
      const live = actor.cards.filter((c) => !c.revealed);
      const pool = [...live, ...s.exchangeDraw];
      s = reducer(s, { type: "EXCHANGE_KEEP", cardIds: pool.slice(0, live.length).map((c) => c.id) });
    } else break;
  }
  return s;
}

interface Case {
  action: ActionKind;
  character: Character;
  /** narrator stem, which differs from the action name for assassinate */
  stem: string;
  target?: string;
  coins?: number;
}

const CASES: Case[] = [
  { action: "tax", character: "duke", stem: "tax" },
  { action: "steal", character: "captain", stem: "steal", target: "p1" },
  { action: "exchange", character: "ambassador", stem: "exchange" },
  { action: "assassinate", character: "assassin", stem: "assassination", target: "p1", coins: 5 },
];

function open(c: Case, holds: boolean): CoupState {
  // give the actor either the real card or a decoy that is never any of the
  // characters the scenario checks for
  let s = hand(game(), "p0", holds ? c.character : "contessa", "contessa");
  s = hand(s, "p1", "duke", "duke");
  if (c.coins) {
    s = JSON.parse(JSON.stringify(s));
    s.players[0].coins = c.coins;
  }
  return reducer(s, { type: "ACT", action: c.action, targetId: c.target });
}

for (const c of CASES) {
  const label = `${c.character}/${c.action}`;

  // ---- 1 & 2: nobody challenges, honest or bluffing — identical audio ----
  for (const holds of [true, false]) {
    const how = holds ? "honest" : "bluff";
    const done = settle(reducer(open(c, holds), { type: "ALLOW" }));
    const heard = paths(done);
    check(
      heard.includes(`narrator/action_${c.stem}`),
      `${label} ${how}, unchallenged: the claim is announced — saw ${heard.join()}`
    );
    check(
      heard.includes(`narrator/resolve_${c.stem}`),
      `${label} ${how}, unchallenged: the narrator closes it — saw ${heard.join()}`
    );
    check(
      !heard.includes(`${c.character}/challenge_reveal`) &&
        !heard.includes(`${c.character}/action_${c.stem}`),
      `${label} ${how}, unchallenged: the claimed influence stays silent — saw ${heard.join()}`
    );
  }

  // an unchallenged bluff still works, and still says nothing extra
  {
    const bluffed = settle(reducer(open(c, false), { type: "ALLOW" }));
    check(
      bluffed.phase !== "reaction",
      `${label} bluff, unchallenged: the action still resolves`
    );
  }

  // ---- 3: challenged and proven — the character takes over ----
  {
    const proven = reducer(reducer(open(c, true), { type: "CHALLENGE", challengerId: "p1" }), {
      type: "REVEAL",
    });
    const heard = paths(proven);
    check(heard.includes("narrator/challenge"), `${label} proven: the challenge is announced`);
    check(
      heard.includes(`${c.character}/challenge_reveal`),
      `${label} proven: the character answers — saw ${heard.join()}`
    );
    check(
      heard.includes(`${c.character}/action_${c.stem}`),
      `${label} proven: and speaks for the action — saw ${heard.join()}`
    );
    const finished = settle(proven);
    check(
      !paths(finished).includes(`narrator/resolve_${c.stem}`),
      `${label} proven: the narrator does NOT also close it — saw ${paths(finished).join()}`
    );
  }

  // ---- 4: challenged and conceded ----
  {
    const conceded = settle(
      reducer(reducer(open(c, false), { type: "CHALLENGE", challengerId: "p1" }), {
        type: "REVEAL",
        concede: true,
      })
    );
    const heard = paths(conceded);
    check(heard.includes("narrator/concede"), `${label} conceded: the narrator covers it`);
    check(
      !heard.includes(`narrator/resolve_${c.stem}`),
      `${label} conceded: nothing resolves — saw ${heard.join()}`
    );
    check(
      !heard.some((p) => p.startsWith(`${c.character}/`)),
      `${label} conceded: the claimed influence never speaks — saw ${heard.join()}`
    );
    check(
      heard.some((p) => p.endsWith("/loss") || p.endsWith("/final_loss")),
      `${label} conceded: whatever was actually lost does speak — saw ${heard.join()}`
    );
  }

  // ---- 5: challenged and the claim was false ----
  {
    const caught = settle(
      reducer(reducer(open(c, false), { type: "CHALLENGE", challengerId: "p1" }), {
        type: "REVEAL",
      })
    );
    const heard = paths(caught);
    check(heard.includes("narrator/false_claim"), `${label} false: the narrator covers it`);
    check(
      !heard.includes(`narrator/resolve_${c.stem}`),
      `${label} false: nothing resolves — saw ${heard.join()}`
    );
    check(
      !heard.some((p) => p.startsWith(`${c.character}/`)),
      `${label} false: the fake claim never speaks — saw ${heard.join()}`
    );
  }
}

// ---------- actions with no claim ----------

{
  // A coup cannot be stopped, but its effect waits on the victim, so the
  // narrator still marks the moment it lands.
  let s = game();
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 7;
  const couped = settle(reducer(s, { type: "ACT", action: "coup", targetId: "p1" }));
  check(
    paths(couped).includes("narrator/resolve_coup"),
    `coup: the narrator marks the landing — saw ${paths(couped).join()}`
  );

  // Income is the one action nothing can interrupt and nothing waits on, so
  // the claim line is the whole event.
  const taken = settle(reducer(game(), { type: "ACT", action: "income" }));
  const heard = paths(taken);
  check(heard.join() === "narrator/action_income", `income says one thing — saw ${heard.join()}`);
  check(
    !heard.some((p) => p.startsWith("narrator/resolve_")),
    "income has no resolution line to play"
  );
  check(
    VARIANTS["narrator/action_income"] === 2,
    `and keeps both readings as variants, saw ${VARIANTS["narrator/action_income"]}`
  );
  check(!("narrator/resolve_income" in VARIANTS), "with no orphaned resolution stem");
}

// ---------- blocks ----------

interface BlockCase {
  action: ActionKind;
  blocker: Character;
  by: string;
  coins?: number;
  target?: string;
}

const BLOCKS: BlockCase[] = [
  { action: "foreign_aid", blocker: "duke", by: "p1" },
  { action: "steal", blocker: "captain", by: "p1", target: "p1" },
  // filed as block_steal: only the Duke blocks foreign aid, so the spec's
  // "Ambassador blocks Foreign Aid" could never have fired
  { action: "steal", blocker: "ambassador", by: "p1", target: "p1" },
  { action: "assassinate", blocker: "contessa", by: "p1", target: "p1", coins: 5 },
];

for (const b of BLOCKS) {
  const label = `${b.blocker} blocks ${b.action}`;

  // unchallenged: the blocker stays face down and must not speak
  {
    let s = hand(game(), "p1", b.blocker, "duke");
    if (b.coins) {
      s = JSON.parse(JSON.stringify(s));
      s.players[0].coins = b.coins;
    }
    const blocked = reducer(reducer(s, { type: "ACT", action: b.action, targetId: b.target }), {
      type: "BLOCK",
      blockerId: b.by,
      claim: b.blocker,
    });
    const stands = settle(reducer(blocked, { type: "ALLOW" }));
    check(
      spokeAnyCharacter(stands).length === 0,
      `${label}, unchallenged: nobody speaks — saw ${paths(stands).join()}`
    );
    check(
      !paths(stands).some((p) => p.startsWith("narrator/resolve_")),
      `${label}, unchallenged: a blocked action does not resolve — saw ${paths(stands).join()}`
    );
  }

  // challenged and proven: the blocker answers, then speaks for the block
  {
    let s = hand(game(), "p1", b.blocker, "duke");
    if (b.coins) {
      s = JSON.parse(JSON.stringify(s));
      s.players[0].coins = b.coins;
    }
    const blocked = reducer(reducer(s, { type: "ACT", action: b.action, targetId: b.target }), {
      type: "BLOCK",
      blockerId: b.by,
      claim: b.blocker,
    });
    const proven = reducer(reducer(blocked, { type: "CHALLENGE", challengerId: "p0" }), {
      type: "REVEAL",
    });
    const heard = paths(proven);
    check(
      heard.includes(`${b.blocker}/challenge_reveal`),
      `${label}, proven: the blocker answers — saw ${heard.join()}`
    );
    check(
      heard.includes(`${b.blocker}/block_${b.action}`),
      `${label}, proven: and speaks for the block — saw ${heard.join()}`
    );
    check(
      !settle(proven).cues.some((c) => c.path.startsWith("narrator/resolve_")),
      `${label}, proven: a standing block resolves nothing`
    );
  }

  // a collapsed block lets the original action through, and since the actor's
  // own claim was never proved, the narrator closes it
  {
    let s = hand(game(), "p1", "duke", "duke");
    s = hand(s, "p0", "contessa", "contessa");
    if (b.coins) {
      s = JSON.parse(JSON.stringify(s));
      s.players[0].coins = b.coins;
    }
    if (b.blocker === "duke") continue; // p1 genuinely holds it here
    const blocked = reducer(reducer(s, { type: "ACT", action: b.action, targetId: b.target }), {
      type: "BLOCK",
      blockerId: b.by,
      claim: b.blocker,
    });
    const collapsed = settle(
      reducer(reducer(blocked, { type: "CHALLENGE", challengerId: "p0" }), { type: "REVEAL" })
    );
    const heard = paths(collapsed);
    check(
      heard.includes("narrator/false_claim"),
      `${label}, bluffed: the false block is narrated — saw ${heard.join()}`
    );
    check(
      !heard.some((p) => p.startsWith(`${b.blocker}/challenge_reveal`)),
      `${label}, bluffed: the fake blocker never speaks — saw ${heard.join()}`
    );
  }
}

// ---------- every cue that can fire must have lines recorded ----------

{
  const referenced = new Set<string>();
  for (const c of CASES) referenced.add(`narrator/resolve_${c.stem}`);
  // income deliberately absent — it has no resolution line
  for (const stem of ["coup", "foreign_aid"]) {
    referenced.add(`narrator/resolve_${stem}`);
  }
  const missing = Array.from(referenced).filter((p) => !(p in VARIANTS));
  check(missing.length === 0, `resolution lines all exist; missing: ${missing.join(", ")}`);
}


// ---------- which cues a device should play ----------

{
  // A fresh game mounts with no cues at all. Priming from that must leave the
  // very first line playable — treating it as history is exactly the bug that
  // made every game's opening action silent.
  const start = primeFrom([]);
  check(start === 0, `a fresh game primes at zero, got ${start}`);
  check(
    freshCues([{ id: 1, path: "narrator/action_tax" }], start).length === 1,
    "so the opening line still plays"
  );

  // Joining midway skips what was already said, and nothing else.
  const history = [1, 2, 3, 4].map((id) => ({ id, path: "x" }));
  const joined = primeFrom(history);
  check(joined === 4, `joining primes past the history, got ${joined}`);
  check(freshCues(history, joined).length === 0, "and replays none of it");
  check(
    freshCues([...history, { id: 5, path: "y" }], joined).map((c) => c.id).join() === "5",
    "but hears the next one"
  );

  // A room pushes the same state repeatedly; a line must not repeat with it.
  const batch = [{ id: 7, path: "a" }, { id: 8, path: "b" }];
  const after = freshCues(batch, 6);
  check(after.map((c) => c.id).join() === "7,8", "a batch plays in order");
  check(freshCues(batch, after[after.length - 1].id).length === 0, "and does not repeat");

  // out-of-order delivery still plays oldest first
  check(
    freshCues([{ id: 9, path: "b" }, { id: 8, path: "a" }], 7).map((c) => c.id).join() === "8,9",
    "cues are sorted before playing"
  );
}

// ---------- the Werewolf moderator ----------

/**
 * One speaker reading a fixed script, so the checks are different in kind:
 * not "who is allowed to say this", but "does every line the screen shows have
 * a recording behind it, saying the same words".
 */
{
  const audio = path.join(process.cwd(), "public", "audio");

  check(wwVoices.length === 1, "the moderator is the only voice in Werewolf");
  check(
    !Object.keys(coupLinesFor).includes(VOICE_ID),
    "and its folder cannot collide with any of Coup's"
  );

  // every night step is both woken and sent back to bed
  for (const step of NIGHT_ORDER) {
    check(STEMS.includes(wakeStem(step)), `${step} has a line waking it`);
    check(STEMS.includes(sleepStem(step)), `${step} has a line sending it to sleep`);
  }
  check(STEMS.includes("open"), "the night opens with a line");
  check(STEMS.includes("dawn"), "and closes with one");
  check(
    STEMS.length === NIGHT_ORDER.length * 2 + 2,
    `the script is exactly the night plus its two ends, saw ${STEMS.length} lines`
  );

  // the words spoken are the words printed — they are built from the same
  // constants, and this is what stops a future edit untying them
  for (const step of NIGHT_ORDER) {
    check(textFor(wakeStem(step)) === WAKE[step], `the ${step} wake line matches the screen`);
    check(textFor(sleepStem(step)) === SLEEP[step], `the ${step} sleep line matches the screen`);
  }
  check(textFor("open") === OPENING, "the opening line matches the screen");
  check(textFor("dawn") === DAWN, "the closing line matches the screen");
  check(
    STEMS.every((s) => (textFor(s) ?? "").trim().length > 0),
    "no line is empty"
  );

  // the table has to be told to wake up as well as to go to sleep
  check(DAWN.includes("wake up"), `the night ends by waking everybody, saw "${DAWN}"`);
  check(OPENING.includes("close your eyes"), `and opens by putting them under, saw "${OPENING}"`);

  // every call leaves a beat between the name and the instruction, which is
  // what the synthesiser reads as a pause
  for (const step of NIGHT_ORDER) {
    check(CALL[step].includes("..."), `the ${step} call pauses after the name`);
    check(SLEEP[step].includes("..."), `so does the ${step} dismissal`);
    check(CALL[step].includes("wake up"), `the ${step} call actually says "wake up"`);
  }
  check(OPENING.includes("...") && DAWN.includes("..."), "and so do both ends of the night");

  // ...and none of it reaches the screen, because a reader does not need to be
  // told to pause and three dots in gold-leaf caps looks like a typo
  for (const line of [OPENING, DAWN, ...NIGHT_ORDER.flatMap((s) => [CALL[s], SLEEP[s]])]) {
    check(!shown(line).includes("..."), `"${shown(line)}" is printed without the speech direction`);
    check(shown(line).length > 0, "and still says something");
  }
  check(shown(OPENING) === "Everyone, close your eyes.", `printed opening reads "${shown(OPENING)}"`);
  check(shown(DAWN) === "Everyone, wake up.", `printed dawn reads "${shown(DAWN)}"`);
  check(
    shown(CALL.werewolf) === "Werewolves, wake up.",
    `printed wolf call reads "${shown(CALL.werewolf)}"`
  );

  // the moderator is a chosen voice, not a designed one, and speaks slowly
  check(wwVoices[0].voiceId === "yVZDNqbDqdOCuvlmZGd4", "the moderator is pinned to one voice");
  check(
    (wwVoices[0].speed ?? 1) < 1,
    `the moderator is slowed down, saw ${wwVoices[0].speed ?? 1}`
  );

  // ...and every one of them has actually been recorded
  if (fs.existsSync(path.join(audio, VOICE_ID))) {
    for (const stem of STEMS) {
      const file = path.join(audio, `${fileFor(stem)!.replace("/audio/", "")}`);
      const there = fs.existsSync(file);
      check(there, `${stem} has a recording at ${fileFor(stem)}`);
      if (there) check(fs.statSync(file).size > 2000, `${stem}'s recording is not a stub`);
    }
    // and nothing is left behind from a stem that has since been renamed
    const onDisk = fs
      .readdirSync(path.join(audio, VOICE_ID))
      .filter((f) => f.endsWith(".mp3"))
      .map((f) => f.replace(/_01\.mp3$/, ""));
    for (const f of onDisk) {
      check(STEMS.includes(f), `${f}.mp3 is on disk but no longer in the script`);
    }
  } else {
    console.log("  (no recordings yet — run npx tsx scripts/generate-voices.ts)");
  }

  check(fileFor("no_such_line") === null, "an unknown stem resolves to silence, not a 404");
}

// ---------- the room tone ----------

{
  const audio = path.join(process.cwd(), "public");

  check(
    SOUNDS.length === 4 + NIGHT_ORDER.length,
    `bed, howls, cockerel, wake cue and one sting per role — saw ${SOUNDS.length}`
  );
  // the "it is you" chime must never be a role sting: at a table, a wolf growl
  // out of somebody pocket names them
  check(
    !NIGHT_ORDER.some((s) => wakeFile() === stingFile(s)),
    "the wake cue is its own sound, not a role sting"
  );
  check(BED.variants === 1 && HOWL.variants > 1, "the bed is one take; the howls are several");
  check(BED.seconds >= 30, `the bed is long enough not to announce its own loop (${BED.seconds}s)`);
  check(BED.music === true, "the bed is composed music, not an atmosphere");
  check(
    SOUNDS.filter((s) => s.music).length === 1,
    "and it is the only thing cut on the music endpoint"
  );
  check(DUCK > 0 && DUCK < 1, "the bed ducks under the moderator rather than stopping");
  check(HOWL_GAP[0] < HOWL_GAP[1], "howls land somewhere inside a range, not on a metronome");

  // every role arrives on its own sound, before it is called by name
  for (const step of NIGHT_ORDER) {
    const file = stingFile(step);
    check(SOUNDS.some((s) => soundFile(s.stem) === file), `${step} has a sting in the manifest`);
    const onDisk = path.join(audio, file);
    if (fs.existsSync(onDisk)) {
      check(fs.statSync(onDisk).size > 3000, `${step}'s sting is real audio`);
    }
  }
  check(STING_LEAD_MS > 0, "the sting gets a beat to itself before the line starts");

  for (const spec of SOUNDS) {
    for (let v = 1; v <= spec.variants; v++) {
      const rel = soundFile(spec.stem, v);
      const file = path.join(audio, rel);
      if (!fs.existsSync(file)) {
        console.log(`  (${rel} not cut yet — run npx tsx scripts/generate-sfx.ts)`);
        continue;
      }
      check(fs.statSync(file).size > 4000, `${rel} is real audio, not a stub`);
    }
  }

  // a repeated sound must actually be able to repeat differently
  const takes = new Set(Array.from({ length: 40 }, () => takeOf(HOWL)));
  check(takes.size === HOWL.variants, `every howl take gets used, saw ${takes.size}`);
  check(takeOf(BED) === soundFile(BED.stem, 1), "the bed has only the one take to pick");
}

if (failures === 0) console.log("ALL VOICE MATRIX CHECKS PASSED");
else {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
}
