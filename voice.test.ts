/**
 * The voice-line matrix: for every influence-based action, both honest and
 * bluffed, challenged and not.
 *
 * The rule under test throughout — a face-down influence is covered by the
 * narrator, and a character speaks only once its card has genuinely been turned
 * face up.
 */
import { initialState, reducer } from "./lib/coup/reducer";
import { CHARACTERS } from "./lib/coup/deck";
import type { ActionKind, Character, CoupState } from "./lib/coup/types";
import { freshCues, primeFrom, VARIANTS } from "./lib/coup/voice";

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

if (failures === 0) console.log("ALL VOICE MATRIX CHECKS PASSED");
else {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
}
