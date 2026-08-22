import { CHARACTERS } from "./lib/coup/deck";
import { initialState, reducer, type Action } from "./lib/coup/reducer";
import { ACTIONS, isAlive, legalActions, eligibleBlockers, othersAlive } from "./lib/coup/rules";
import type { CoupState, InfluenceCard } from "./lib/coup/types";
import { VARIANTS } from "./lib/coup/voice";
import { known, viewFor } from "./lib/coup/view";
import { BLOCKS, REFERENCE } from "./lib/coup/reference";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

const roster = (...names: string[]) => names.map((name, i) => ({ id: `p${i}`, name }));

function start(...names: string[]): CoupState {
  let s = reducer(initialState(), { type: "START", players: roster(...names) });
  while (s.phase === "deal") s = reducer(s, { type: "DEAL_NEXT" });
  return s;
}

/** Every card in the game, wherever it currently lives. */
function allCards(s: CoupState): InfluenceCard[] {
  return [...s.court, ...s.exchangeDraw, ...s.players.flatMap((p) => p.cards)];
}

function checkConservation(s: CoupState, where: string) {
  const cards = allCards(s);
  check(cards.length === 15, `${where}: 15 cards accounted for, saw ${cards.length}`);
  const ids = new Set(cards.map((c) => c.id));
  check(ids.size === cards.length, `${where}: no duplicated cards`);
}

/** Force a player's hand so a scenario is deterministic. */
function setHand(s: CoupState, playerId: string, ...characters: InfluenceCard["character"][]): CoupState {
  const next: CoupState = JSON.parse(JSON.stringify(s));
  const player = next.players.find((p) => p.id === playerId)!;
  player.cards = characters.map((character, i) => ({
    id: `forced-${playerId}-${i}`,
    character,
    revealed: false,
  }));
  return next;
}

// ---------- setup ----------

{
  const s = start("Kenji", "Miko", "Ana");
  check(s.phase === "turn", "three-hander reaches the first turn");
  check(s.players.every((p) => p.cards.length === 2), "everyone holds two influences");
  check(s.players.every((p) => p.coins === 2), "everyone holds two coins");
  check(s.court.length === 15 - 6, `court keeps the remainder, saw ${s.court.length}`);
  checkConservation(s, "setup");

  const heads = start("Kenji", "Miko");
  check(heads.players[0].coins === 1, "head-to-head opener starts a coin down");
  check(heads.players[1].coins === 2, "head-to-head responder starts on two");

  const dealing = reducer(initialState(), { type: "START", players: roster("A", "B", "C") });
  check(dealing.phase === "deal", "deal phase gates the opening peek");
  let peeks = 0;
  let d = dealing;
  while (d.phase === "deal" && peeks < 10) {
    d = reducer(d, { type: "DEAL_NEXT" });
    peeks++;
  }
  check(peeks === 3, `one peek per player, took ${peeks}`);
}

// ---------- plain actions ----------

{
  const s = start("Kenji", "Miko", "Ana");
  const income = reducer(s, { type: "ACT", action: "income" });
  check(income.players[0].coins === 3, "income pays 1");
  check(income.turnIndex === 1, "income passes the turn");

  // an untargeted action must not invent a target in the log
  const taxLog = reducer(s, { type: "ACT", action: "tax" }).log.at(-1)!.text;
  check(taxLog === "Kenji claims the Duke — Tax.", `untargeted claim reads clean, got "${taxLog}"`);
  const stealLog = reducer(s, { type: "ACT", action: "steal", targetId: "p1" }).log.at(-1)!.text;
  check(
    stealLog === "Kenji claims the Captain — Steal on Miko.",
    `targeted claim names the mark, got "${stealLog}"`
  );

  const aid = reducer(s, { type: "ACT", action: "foreign_aid" });
  check(aid.phase === "reaction", "foreign aid waits for a Duke");
  check(aid.pending?.claim === null, "foreign aid claims nobody");
  const aidThrough = reducer(aid, { type: "ALLOW" });
  check(aidThrough.players[0].coins === 4, "unblocked foreign aid pays 2");
}

// ---------- forced coup ----------

{
  let s = start("Kenji", "Miko", "Ana");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 10;
  check(legalActions(s).join() === "coup", "ten coins leaves only a coup");
  const couped = reducer(s, { type: "ACT", action: "coup", targetId: "p1" });
  check(couped.players[0].coins === 3, "a coup costs 7");
  check(
    couped.phase === "reveal" && couped.reveal?.playerId === "p1",
    "a coup sends the target straight to a reveal"
  );
  const done = reducer(couped, { type: "LOSE", cardId: couped.players[1].cards[0].id });
  check(done.players[1].cards.filter((c) => c.revealed).length === 1, "the coup takes one influence");
  check(done.phase === "turn", "play resumes after the coup");
}

// ---------- challenging the actor ----------

{
  // Kenji really is the Duke: Miko's challenge should cost Miko an influence,
  // and the tax should still go through.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "duke", "contessa");
  s = setHand(s, "p1", "captain", "captain");
  const taxed = reducer(s, { type: "ACT", action: "tax" });
  check(taxed.phase === "reaction", "tax invites a challenge");
  const showdown = reducer(taxed, { type: "CHALLENGE", challengerId: "p1" });
  check(showdown.phase === "showdown", "a challenge waits on the challenged player");
  check(showdown.reveal === null, "nobody pays until the card is turned over");
  const called = reducer(showdown, { type: "REVEAL" });
  check(called.phase === "reveal" && called.reveal?.playerId === "p1", "wrong caller pays up");
  const after = reducer(called, { type: "LOSE", cardId: called.players[1].cards[0].id });
  check(after.players[0].coins === 5, "a proven tax still collects 3");
  check(
    after.players[1].cards.filter((c) => c.revealed).length === 1,
    "the failed challenger is down an influence"
  );
  const dukeStill = after.players[0].cards.some((c) => !c.revealed);
  check(dukeStill, "the proven Duke keeps both influences");
  checkConservation(after, "proven challenge");
  check(after.court.length === s.court.length, "the court is the same size after a swap");

  // The shown card goes back into the court and a replacement is drawn — which
  // means it can legitimately come back, so prove the swap over many runs
  // rather than asserting on any single one.
  let everReplaced = false;
  for (let i = 0; i < 60 && !everReplaced; i++) {
    let run = start("Kenji", "Miko", "Ana");
    run = setHand(run, "p0", "duke", "contessa");
    const challenged = reducer(
      reducer(reducer(run, { type: "ACT", action: "tax" }), {
        type: "CHALLENGE",
        challengerId: "p1",
      }),
      { type: "REVEAL" }
    );
    const settled =
      challenged.phase === "reveal"
        ? reducer(challenged, { type: "LOSE", cardId: challenged.players[1].cards[0].id })
        : challenged;
    if (!settled.players[0].cards.some((c) => c.id === "forced-p0-0")) everReplaced = true;
  }
  check(everReplaced, "a proven card is returned to the court and redrawn");
}

{
  // Kenji is bluffing the Duke: he pays, and the tax collects nothing.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "captain", "contessa");
  const taxed = reducer(s, { type: "ACT", action: "tax" });
  const showdown = reducer(taxed, { type: "CHALLENGE", challengerId: "p1" });
  check(showdown.phase === "showdown", "a bluffer is not outed before answering");
  check(
    showdown.beats.every((b) => b.kind !== "bluff"),
    "and the app does not announce the bluff for them"
  );
  const called = reducer(showdown, { type: "REVEAL" });
  check(called.phase === "reveal" && called.reveal?.playerId === "p0", "the bluffer pays up");
  const after = reducer(called, { type: "LOSE", cardId: called.players[0].cards[0].id });
  check(after.players[0].coins === 2, "a caught bluff collects nothing");
  check(after.turnIndex === 1, "the turn moves on after a caught bluff");
  checkConservation(after, "caught bluff");
}

{
  // A failed challenge does not cancel the action — it costs the challenger an
  // influence AND lets the action through. Against an assassin that is fatal:
  // one influence for the bad call, one for the assassination.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "assassin", "duke");
  s = setHand(s, "p1", "captain", "ambassador");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 5;

  const hit = reducer(s, { type: "ACT", action: "assassinate", targetId: "p1" });
  const shown = reducer(reducer(hit, { type: "CHALLENGE", challengerId: "p1" }), {
    type: "REVEAL",
  });
  check(shown.reveal?.playerId === "p1", "the failed challenger pays first");
  const after = reducer(shown, { type: "LOSE", cardId: shown.players[1].cards[0].id });

  check(
    after.players[1].cards.every((c) => c.revealed),
    "challenging an assassin and losing costs both influences"
  );
  check(!isAlive(after.players[1]), "which eliminates the challenger");
  check(after.players[0].coins === 2, "and the assassin's 3 coins stay spent");

  // the same shape without the kill: the tax still collects
  let t = start("Kenji", "Miko", "Ana");
  t = setHand(t, "p0", "duke", "contessa");
  t = setHand(t, "p1", "captain", "ambassador");
  const taxed = reducer(reducer(t, { type: "ACT", action: "tax" }), {
    type: "CHALLENGE",
    challengerId: "p1",
  });
  const proved = reducer(taxed, { type: "REVEAL" });
  check(proved.players[0].coins === 2, "the action waits until the challenger has paid");
  const done = reducer(proved, { type: "LOSE", cardId: proved.players[1].cards[0].id });
  check(done.players[0].coins === 5, "then it goes through");
  // The proven card is shuffled back BEFORE its replacement is drawn, so it can
  // legitimately come straight back — asserting it changed is a one-in-ten
  // flake. The court keeping its size is the part that must always hold; the
  // swap itself is proven above over many runs.
  check(done.court.length === t.court.length, "and the court is unchanged in size");
}

// ---------- blocks ----------

{
  // Only the target may block an assassination, and a Contessa block that
  // survives its challenge stops the kill — but the 3 coins are gone.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "assassin", "duke");
  s = setHand(s, "p1", "contessa", "captain");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 5;
  const hit = reducer(s, { type: "ACT", action: "assassinate", targetId: "p1" });
  check(hit.players[0].coins === 2, "assassination is paid for on declaration");
  check(
    eligibleBlockers(hit).map((p) => p.id).join() === "p1",
    "only the mark can call Contessa"
  );
  const blocked = reducer(hit, { type: "BLOCK", blockerId: "p1", claim: "contessa" });
  check(blocked.phase === "block", "a block invites its own challenge");
  const stands = reducer(blocked, { type: "ALLOW" });
  check(
    stands.players[1].cards.every((c) => !c.revealed),
    "an unchallenged Contessa saves the mark"
  );
  check(stands.players[0].coins === 2, "the assassin does not get the 3 coins back");
  check(stands.turnIndex === 1, "play moves on after a successful block");
}

{
  // A bluffed Contessa: the block collapses and the assassination lands, so
  // the blocker loses both influences and is out.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "assassin", "duke");
  s = setHand(s, "p1", "captain", "ambassador");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 5;
  const hit = reducer(s, { type: "ACT", action: "assassinate", targetId: "p1" });
  const blocked = reducer(hit, { type: "BLOCK", blockerId: "p1", claim: "contessa" });
  let called = reducer(reducer(blocked, { type: "CHALLENGE", challengerId: "p0" }), {
    type: "REVEAL",
  });
  check(called.reveal?.playerId === "p1", "the bluffing blocker pays first");
  called = reducer(called, { type: "LOSE", cardId: called.players[1].cards[0].id });
  check(
    called.players[1].cards.every((c) => c.revealed),
    "the collapsed block lets the assassination through, taking the second card"
  );
  check(!isAlive(called.players[1]), "losing both influences is elimination");
  checkConservation(called, "collapsed block");
}

{
  // Foreign aid is blockable by anyone, not just a target.
  const s = start("Kenji", "Miko", "Ana");
  const aid = reducer(s, { type: "ACT", action: "foreign_aid" });
  check(eligibleBlockers(aid).length === 2, "any Duke can block foreign aid");
  const blocked = reducer(aid, { type: "BLOCK", blockerId: "p2", claim: "duke" });
  const stands = reducer(blocked, { type: "ALLOW" });
  check(stands.players[0].coins === 2, "a standing Duke block denies the aid");
}

// ---------- stealing ----------

{
  let s = start("Kenji", "Miko", "Ana");
  s = JSON.parse(JSON.stringify(s));
  s.players[1].coins = 1;
  const theft = reducer(s, { type: "ACT", action: "steal", targetId: "p1" });
  const through = reducer(theft, { type: "ALLOW" });
  check(through.players[0].coins === 3, "stealing from a near-broke player takes what is there");
  check(through.players[1].coins === 0, "the mark is cleaned out, not put in debt");

  let broke = start("Kenji", "Miko", "Ana");
  broke = JSON.parse(JSON.stringify(broke));
  broke.players[1].coins = 0;
  const nothing = reducer(reducer(broke, { type: "ACT", action: "steal", targetId: "p1" }), {
    type: "ALLOW",
  });
  check(nothing.players[0].coins === 2, "stealing from an empty pocket pays nothing");
}

// ---------- exchange ----------

{
  const s = start("Kenji", "Miko", "Ana");
  const swap = reducer(s, { type: "ACT", action: "exchange" });
  const drawing = reducer(swap, { type: "ALLOW" });
  check(drawing.phase === "exchange", "an allowed exchange draws from the court");
  check(drawing.exchangeDraw.length === 2, "the ambassador draws two");
  checkConservation(drawing, "mid-exchange");

  const pool = [...drawing.players[0].cards, ...drawing.exchangeDraw];
  const kept = reducer(drawing, { type: "EXCHANGE_KEEP", cardIds: [pool[3].id, pool[2].id] });
  check(kept.players[0].cards.length === 2, "the ambassador keeps two");
  check(kept.exchangeDraw.length === 0, "nothing is left in hand");
  check(kept.court.length === drawing.court.length + 2, "the rest goes back to the court");
  check(kept.phase === "turn", "play resumes after an exchange");
  checkConservation(kept, "after exchange");

  const wrongCount = reducer(drawing, { type: "EXCHANGE_KEEP", cardIds: [pool[0].id] });
  check(wrongCount === drawing, "keeping the wrong number of cards is rejected");
}

{
  // A one-influence ambassador hands back three of four.
  let s = start("Kenji", "Miko", "Ana");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].cards[1].revealed = true;
  const drawing = reducer(reducer(s, { type: "ACT", action: "exchange" }), { type: "ALLOW" });
  const live = drawing.players[0].cards.filter((c) => !c.revealed);
  const pool = [...live, ...drawing.exchangeDraw];
  const kept = reducer(drawing, { type: "EXCHANGE_KEEP", cardIds: [pool[2].id] });
  check(
    kept.players[0].cards.filter((c) => !c.revealed).length === 1,
    "a wounded ambassador still holds one influence"
  );
  check(kept.court.length === drawing.court.length + 2, "the other two go back");
  checkConservation(kept, "wounded exchange");
}

// ---------- elimination and victory ----------

{
  let s = start("Kenji", "Miko");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 7;
  s.players[1].cards[1].revealed = true; // Miko is down to one
  const couped = reducer(s, { type: "ACT", action: "coup", targetId: "p1" });
  check(couped.phase === "ended", "taking the last influence ends the game");
  check(couped.winnerId === "p0", "the survivor wins");
}

// ---------- undo ----------

{
  const s = start("Kenji", "Miko", "Ana");
  const income = reducer(s, { type: "ACT", action: "income" });
  const back = reducer(income, { type: "UNDO" });
  check(back.players[0].coins === 2, "undo returns the coin");
  check(back.turnIndex === 0, "undo returns the turn");
  check(back.phase === "turn", "undo restores the phase");
}

// ---------- the story of an action ----------

{
  // A proven claim is the one moment the card is genuinely face up, so that
  // beat carries it and says it went back to the court.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "duke", "contessa");
  const called = reducer(
    reducer(reducer(s, { type: "ACT", action: "tax" }), {
      type: "CHALLENGE",
      challengerId: "p1",
    }),
    { type: "REVEAL" }
  );

  const kinds = called.beats.map((b) => b.kind);
  check(kinds.includes("challenge"), `the call is recorded, saw ${kinds.join()}`);
  const proven = called.beats.find((b) => b.kind === "proven");
  check(Boolean(proven), "a proven claim is recorded");
  check(proven?.character === "duke", `the proven card is named, saw ${proven?.character}`);
  check(proven?.fate === "returned", "and it goes back to the court");

  const settled = reducer(called, { type: "LOSE", cardId: called.players[1].cards[0].id });
  const given = settled.beats.find((b) => b.kind === "surrender");
  check(Boolean(given?.character), "the surrendered influence is named");
  check(given?.fate === "spent", "and it is out of the game");
}

{
  // A bluff reveals nothing, so no card may be attached to that beat.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "captain", "contessa");
  const called = reducer(
    reducer(reducer(s, { type: "ACT", action: "tax" }), {
      type: "CHALLENGE",
      challengerId: "p1",
    }),
    { type: "REVEAL" }
  );
  const bluff = called.beats.find((b) => b.kind === "bluff");
  check(Boolean(bluff), "a caught bluff is recorded");
  check(
    bluff?.character === null,
    "a bluff shows no card, because there was none to show"
  );
  check(
    called.beats.every((b) => b.kind !== "proven"),
    "and nothing is recorded as proven"
  );
}

{
  // Blocks are claims, not reveals — recorded, but with no card attached.
  const s = start("Kenji", "Miko", "Ana");
  const blocked = reducer(reducer(s, { type: "ACT", action: "foreign_aid" }), {
    type: "BLOCK",
    blockerId: "p2",
    claim: "duke",
  });
  const block = blocked.beats.find((b) => b.kind === "block");
  check(Boolean(block), "a block is recorded");
  check(block?.character === null, "an unproven block shows no card");
}

{
  // Each new action starts its own story.
  let s = start("Kenji", "Miko", "Ana");
  s = reducer(s, { type: "ACT", action: "foreign_aid" });
  s = reducer(s, { type: "BLOCK", blockerId: "p1", claim: "duke" });
  check(s.beats.length > 0, "the block left a beat");
  s = reducer(s, { type: "ALLOW" });
  const next = reducer(s, { type: "ACT", action: "income" });
  check(next.beats.length === 0, "the next action clears the previous story");
}

// ---------- voice cues ----------

{
  // The narrator announces an action without naming the influence claimed for
  // it — the card is face down and the claim may be a lie.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "captain", "contessa");
  const taxed = reducer(s, { type: "ACT", action: "tax" });
  const paths = taxed.cues.map((c) => c.path);
  check(paths.join() === "narrator/action_tax", `narrator announces tax, saw ${paths.join()}`);
  check(
    !paths.some((p) => CHARACTERS.some((c) => p.startsWith(`${c}/`))),
    "no character speaks for an unproven claim"
  );

  // and if nobody challenges, no character ever speaks
  const allowed = reducer(taxed, { type: "ALLOW" });
  check(
    !allowed.cues.some((p) => CHARACTERS.some((c) => p.path.startsWith(`${c}/`))),
    "an unchallenged bluff stays silent"
  );
}

{
  // Proven: the card is face up, so the character speaks — the challenge line
  // first, then the line for what it was claiming to do.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "duke", "contessa");
  const shown = reducer(reducer(s, { type: "ACT", action: "tax" }), {
    type: "CHALLENGE",
    challengerId: "p1",
  });
  check(
    shown.cues.map((c) => c.path).includes("narrator/challenge"),
    "the challenge is announced"
  );
  const proved = reducer(shown, { type: "REVEAL" });
  const paths = proved.cues.map((c) => c.path);
  check(paths.includes("duke/challenge_reveal"), `the Duke answers, saw ${paths.join()}`);
  check(paths.includes("duke/action_tax"), "and then speaks for the tax");
  check(
    paths.indexOf("duke/challenge_reveal") < paths.indexOf("duke/action_tax"),
    "in that order"
  );
}

{
  // Conceding never turns the claimed card over, so that influence must stay
  // silent — only the narrator, and then whatever was actually given up.
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "duke", "contessa");
  const conceded = reducer(
    reducer(reducer(s, { type: "ACT", action: "tax" }), {
      type: "CHALLENGE",
      challengerId: "p1",
    }),
    { type: "REVEAL", concede: true }
  );
  const paths = conceded.cues.map((c) => c.path);
  check(paths.includes("narrator/concede"), `the narrator covers a concession, saw ${paths.join()}`);
  check(
    !paths.includes("duke/challenge_reveal"),
    "the conceded Duke does not speak, having never been shown"
  );
  check(conceded.reveal?.playerId === "p0", "and the conceder gives up an influence");
  check(conceded.players[0].coins === 2, "a conceded claim collects nothing");
}

{
  // Proving a card you do not hold is legal theatre, and reads as a false claim
  let s = start("Kenji", "Miko", "Ana");
  s = setHand(s, "p0", "captain", "contessa");
  const caught = reducer(
    reducer(reducer(s, { type: "ACT", action: "tax" }), {
      type: "CHALLENGE",
      challengerId: "p1",
    }),
    { type: "REVEAL" }
  );
  const paths = caught.cues.map((c) => c.path);
  check(paths.includes("narrator/false_claim"), `a false claim is narrated, saw ${paths.join()}`);
  check(!paths.includes("duke/challenge_reveal"), "and no Duke speaks, there being none");
}

{
  // Losing an influence turns it face up, so it may speak — and its last one
  // is a different line.
  let s = start("Kenji", "Miko");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 7;
  s.players[1].cards = [
    { id: "b0", character: "captain", revealed: false },
    { id: "b1", character: "contessa", revealed: false },
  ];
  const couped = reducer(s, { type: "ACT", action: "coup", targetId: "p1" });
  const wounded = reducer(couped, { type: "LOSE", cardId: "b0" });
  check(
    wounded.cues.some((c) => c.path === "captain/loss"),
    `the surrendered Captain speaks, saw ${wounded.cues.map((c) => c.path).join()}`
  );
  check(
    !wounded.cues.some((c) => c.path === "captain/final_loss"),
    "but not its final line, with one influence left"
  );

  let last = JSON.parse(JSON.stringify(wounded)) as CoupState;
  last.players[0].coins = 7;
  last.turnIndex = 0;
  last.phase = "turn";
  const finished = reducer(last, { type: "ACT", action: "coup", targetId: "p1" });
  check(
    finished.cues.some((c) => c.path === "contessa/final_loss"),
    `the last influence gets the final line, saw ${finished.cues.map((c) => c.path).join()}`
  );
}

{
  // Every cue path must exist in the manifest, or it plays nothing.
  const seen = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    let s = start("A", "B", "C");
    let steps = 0;
    while (s.phase !== "ended" && steps++ < 400) {
      s.cues.forEach((c) => seen.add(c.path));
      const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
      let move: Action;
      if (s.phase === "turn") {
        const kind = pick(legalActions(s));
        const info = ACTIONS[kind];
        const targets = othersAlive(s, s.players[s.turnIndex].id);
        if (info.needsTarget && targets.length === 0) break;
        move = info.needsTarget
          ? { type: "ACT", action: kind, targetId: pick(targets).id }
          : { type: "ACT", action: kind };
      } else if (s.phase === "reaction") {
        const opts: Action[] = [{ type: "ALLOW" }];
        if (s.pending?.claim) {
          for (const p of othersAlive(s, s.pending.actorId)) {
            opts.push({ type: "CHALLENGE", challengerId: p.id });
          }
        }
        for (const b of eligibleBlockers(s)) {
          for (const claim of ACTIONS[s.pending!.action].blockedBy) {
            opts.push({ type: "BLOCK", blockerId: b.id, claim });
          }
        }
        move = pick(opts);
      } else if (s.phase === "block") {
        const opts: Action[] = [{ type: "ALLOW" }];
        for (const p of othersAlive(s, s.pending!.blockerId)) {
          opts.push({ type: "CHALLENGE", challengerId: p.id });
        }
        move = pick(opts);
      } else if (s.phase === "showdown") {
        move = { type: "REVEAL", concede: Math.random() < 0.3 };
      } else if (s.phase === "reveal") {
        const who = s.players.find((p) => p.id === s.reveal!.playerId)!;
        move = { type: "LOSE", cardId: pick(who.cards.filter((c) => !c.revealed)).id };
      } else if (s.phase === "exchange") {
        const actor = s.players.find((p) => p.id === s.pending!.actorId)!;
        const live = actor.cards.filter((c) => !c.revealed);
        const pool = [...live, ...s.exchangeDraw];
        move = { type: "EXCHANGE_KEEP", cardIds: pool.slice(0, live.length).map((c) => c.id) };
      } else break;
      const next = reducer(s, move);
      if (next === s) break;
      s = next;
    }
    s.cues.forEach((c) => seen.add(c.path));
  }

  const missing = Array.from(seen).filter((p) => !(p in VARIANTS));
  check(missing.length === 0, `every cue has recorded lines; missing: ${missing.join(", ")}`);
  check(seen.size > 12, `the sweep exercised a good spread of cues, saw ${seen.size}`);
}

{
  // A rematch must not restart the cue counter. It used to, so a client that
  // had been listening all game filtered the new deal's lines out as ones it
  // had already heard, and the whole rematch played in silence.
  let s = start("Kenji", "Miko", "Ana");
  s = reducer(s, { type: "ACT", action: "income" });
  s = reducer(s, { type: "ACT", action: "income" });
  const heardUpTo = s.cueSeq;
  check(heardUpTo > 0, "the first game raised some cues");

  let again = reducer(s, { type: "RESTART" });
  check(again.cueSeq === heardUpTo, `a rematch carries the counter forward, got ${again.cueSeq}`);
  while (again.phase === "deal") again = reducer(again, { type: "DEAL_NEXT" });
  again = reducer(again, { type: "ACT", action: "income" });
  check(
    again.cues.every((c) => c.id > heardUpTo),
    `and its lines are newer than anything already heard, got ${again.cues.map((c) => c.id).join()}`
  );

  // same for a full reset back to setup
  const reset = reducer(s, { type: "NEW_GAME" });
  check(reset.cueSeq === heardUpTo, "changing players carries the counter too");
}

{
  // the story of a surrender names who it happened to, for the end screen
  let s = start("Kenji", "Miko");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 7;
  const couped = reducer(s, { type: "ACT", action: "coup", targetId: "p1" });
  const done = reducer(couped, { type: "LOSE", cardId: couped.players[1].cards[0].id });
  const fell = done.beats.find((b) => b.kind === "surrender");
  check(fell?.who === "Miko", `the fallen card names its owner, got ${fell?.who}`);
}

{
  // A coup is ordered when the target is picked, but only carried out when
  // they actually hand a card over — so that line must wait for the surrender
  // rather than firing while the victim is still choosing.
  let s = start("Kenji", "Miko", "Ana");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 7;

  const ordered = reducer(s, { type: "ACT", action: "coup", targetId: "p1" });
  check(ordered.phase === "reveal", "the target is still choosing");
  const atOrder = ordered.cues.map((c) => c.path);
  check(atOrder.includes("narrator/action_coup"), "the coup is announced on ordering");
  check(
    !atOrder.includes("narrator/resolve_coup"),
    `and NOT called carried out yet — saw ${atOrder.join()}`
  );

  const landed = reducer(ordered, { type: "LOSE", cardId: ordered.players[1].cards[0].id });
  const after = landed.cues.map((c) => c.path);
  const carried = after.indexOf("narrator/resolve_coup");
  const fell = after.findIndex((p) => p.endsWith("/loss") || p.endsWith("/final_loss"));
  check(carried >= 0, `it is carried out once the card is given up — saw ${after.join()}`);
  check(carried < fell, "and lands before the card it took speaks");
}

{
  // Same for an assassination that gets through unchallenged.
  let s = start("Kenji", "Miko", "Ana");
  s = JSON.parse(JSON.stringify(s));
  s.players[0].coins = 5;
  const declared = reducer(reducer(s, { type: "ACT", action: "assassinate", targetId: "p1" }), {
    type: "ALLOW",
  });
  check(
    !declared.cues.map((c) => c.path).includes("narrator/resolve_assassination"),
    `an assassination is not called done while the mark chooses — saw ${declared.cues.map((c) => c.path).join()}`
  );
  const struck = reducer(declared, { type: "LOSE", cardId: declared.players[1].cards[0].id });
  check(
    struck.cues.map((c) => c.path).includes("narrator/resolve_assassination"),
    "it succeeds once the influence is surrendered"
  );

  // With one influence left there is no choice, so it lands immediately.
  let quick = start("Kenji", "Miko", "Ana");
  quick = JSON.parse(JSON.stringify(quick));
  quick.players[0].coins = 7;
  quick.players[1].cards[1].revealed = true;
  const instant = reducer(quick, { type: "ACT", action: "coup", targetId: "p1" });
  check(
    instant.cues.map((c) => c.path).includes("narrator/resolve_coup"),
    "with nothing to choose, the blow lands in the same breath"
  );
}

// ---------- fuzz: random legal play must always terminate cleanly ----------

{
  let games = 0;
  let ended = 0;
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  for (let seed = 0; seed < 400; seed++) {
    const size = 2 + (seed % 5); // 2..6 players
    let s = start(...Array.from({ length: size }, (_, i) => `P${i}`));
    games++;
    let steps = 0;

    while (s.phase !== "ended" && steps++ < 4000) {
      checkConservation(s, `fuzz step ${steps}`);
      let move: Action | null = null;

      if (s.phase === "turn") {
        const kind = pick(legalActions(s));
        const info = ACTIONS[kind];
        if (info.needsTarget) {
          const targets = othersAlive(s, s.players[s.turnIndex].id);
          if (targets.length === 0) break;
          move = { type: "ACT", action: kind, targetId: pick(targets).id };
        } else {
          move = { type: "ACT", action: kind };
        }
      } else if (s.phase === "reaction") {
        const options: Action[] = [{ type: "ALLOW" }];
        if (s.pending?.claim) {
          for (const p of othersAlive(s, s.pending.actorId)) {
            options.push({ type: "CHALLENGE", challengerId: p.id });
          }
        }
        for (const blocker of eligibleBlockers(s)) {
          for (const claim of ACTIONS[s.pending!.action].blockedBy) {
            options.push({ type: "BLOCK", blockerId: blocker.id, claim });
          }
        }
        move = pick(options);
      } else if (s.phase === "block") {
        const options: Action[] = [{ type: "ALLOW" }];
        for (const p of othersAlive(s, s.pending!.blockerId)) {
          options.push({ type: "CHALLENGE", challengerId: p.id });
        }
        move = pick(options);
      } else if (s.phase === "showdown") {
        move = { type: "REVEAL" };
      } else if (s.phase === "reveal") {
        const player = s.players.find((p) => p.id === s.reveal!.playerId)!;
        const live = player.cards.filter((c) => !c.revealed);
        check(live.length >= 2, "a reveal prompt only appears when there is a choice");
        move = { type: "LOSE", cardId: pick(live).id };
      } else if (s.phase === "exchange") {
        const actor = s.players.find((p) => p.id === s.pending!.actorId)!;
        const live = actor.cards.filter((c) => !c.revealed);
        const pool = [...live, ...s.exchangeDraw];
        // keep as many as are held, chosen arbitrarily from the pool
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        move = { type: "EXCHANGE_KEEP", cardIds: shuffled.slice(0, live.length).map((c) => c.id) };
      } else {
        break;
      }

      const next = reducer(s, move);
      check(next !== s, `fuzz: ${move.type} in ${s.phase} was rejected`);
      if (next === s) break;
      s = next;
    }

    if (s.phase === "ended") {
      ended++;
      const alive = s.players.filter(isAlive);
      check(alive.length === 1, `fuzz: exactly one survivor, saw ${alive.length}`);
      check(s.winnerId === alive[0]?.id, "fuzz: the survivor is recorded as the winner");
      checkConservation(s, "fuzz end");
    } else {
      check(false, `fuzz: game ${seed} never finished (stuck in ${s.phase})`);
    }
  }

  check(games === 400 && ended === 400, `fuzz: all ${games} games resolved, ${ended} did`);
}

// ---------- character sanity ----------

{
  const s = start("Kenji", "Miko", "Ana");
  const counts = new Map<string, number>();
  for (const card of allCards(s)) {
    counts.set(card.character, (counts.get(card.character) ?? 0) + 1);
  }
  check(counts.size === 5, "all five characters are in the box");
  check(
    CHARACTERS.every((c) => counts.get(c) === 3),
    "three copies of each character"
  );
}

// ---------- a proven claim costs you the card ----------

{
  // Winning a challenge does not let you keep the card you proved: it goes
  // back into the court, gets shuffled, and you draw a replacement.
  let s = setHand(start("Kenji", "Miko", "Ana"), "p0", "duke", "contessa");
  const before = s.players[0].cards.map((c) => c.id);
  const court = s.court.length;

  s = reducer(s, { type: "ACT", action: "tax" });
  s = reducer(s, { type: "CHALLENGE", challengerId: "p1" });
  s = reducer(s, { type: "REVEAL" });

  /*
   * The proven card goes back into the court, the court is shuffled, and one
   * is drawn — so the replacement can legitimately be the very same card, and
   * a single run cannot assert the id changed. (The block further up proves
   * the swap happens by running it sixty times.) What holds every time is the
   * bookkeeping: one card out, one card in, nothing else touched.
   */
  const after = s.players[0].cards.map((c) => c.id);
  check(after[1] === before[1], "the other influence is left alone");
  check(s.court.length === court, "the court is the same size — one in, one out");
  check(s.players[0].cards.length === 2, "and the prover still holds two");
  checkConservation(s, "after a proven challenge");
  check(
    s.log.some((l) => l.text.includes("draws a replacement")),
    "and the table is told it happened"
  );

  // a bluff that gets caught keeps nothing and swaps nothing
  let bluff = setHand(start("Kenji", "Miko", "Ana"), "p0", "contessa", "contessa");
  const held = bluff.players[0].cards.map((c) => c.id);
  bluff = reducer(bluff, { type: "ACT", action: "tax" });
  bluff = reducer(bluff, { type: "CHALLENGE", challengerId: "p1" });
  bluff = reducer(bluff, { type: "REVEAL" });
  check(
    bluff.players[0].cards.map((c) => c.id).join() === held.join(),
    "a caught bluff swaps nothing — there was no card to prove"
  );
}

// ---------- the table rotates ----------

{
  // Seat order used to decide who opened every single game.
  let s = start("Kenji", "Miko", "Ana");
  check(s.turnIndex === 0, "the first game of the night opens on the first seat");

  // hand it to Ana and restart: she opens the next one
  s = { ...s, phase: "ended", winnerId: "p2" };
  const rematch = reducer(s, { type: "RESTART" });
  check(rematch.turnIndex === 2, `the winner opens the rematch, saw seat ${rematch.turnIndex}`);
  check(
    rematch.players.map((p) => p.id).join() === "p0,p1,p2",
    "and the seating is left alone — only the opener moves"
  );

  /*
   * And it survives the deal. This is where the whole thing used to come
   * undone: START picked the opener and DEAL_NEXT reset the turn to zero on
   * its way out of the round, so seat one opened every game no matter who won
   * the last. Checking the state straight out of RESTART missed it, because
   * the deal had not been walked yet — and a room walks it server-side, so it
   * was broken there too.
   */
  let played = rematch;
  while (played.phase === "deal") played = reducer(played, { type: "DEAL_NEXT" });
  check(played.phase === "turn", `the deal finishes (${played.phase})`);
  check(played.turnIndex === 2, `Ana still opens once the cards are out, saw seat ${played.turnIndex}`);
  const opens = played.log.filter((c) => c.text.includes("opens"));
  check(
    opens.length > 0 && opens[opens.length - 1].text.startsWith("Ana"),
    `and it is Ana who is announced (${opens.map((c) => c.text).join(" | ")})`
  );
  // the first legal action is hers, not the first seat's
  const hers = reducer(played, { type: "ACT", action: "income" });
  check(hers.players[2].coins === 3, `Ana takes the first turn (${hers.players.map((p) => p.coins).join("/")})`);

  // head to head, the coin handicap follows the opener rather than seat one
  let duel = start("Kenji", "Miko");
  duel = { ...duel, phase: "ended", winnerId: "p1" };
  const again = reducer(duel, { type: "RESTART" });
  check(again.turnIndex === 1, "head-to-head, the winner opens");
  check(
    again.players[1].coins === 1 && again.players[0].coins === 2,
    `the opener takes the coin handicap, saw ${again.players.map((p) => p.coins).join("/")}`
  );

  // a game nobody won still deals
  let nobody = reducer({ ...start("Kenji", "Miko"), winnerId: null }, { type: "RESTART" });
  check(nobody.turnIndex === 0, "with no winner on record the first seat opens");
  while (nobody.phase === "deal") nobody = reducer(nobody, { type: "DEAL_NEXT" });
  check(nobody.turnIndex === 0, "and still does after the deal");

  // three games running: the table keeps moving rather than settling on a seat
  let table = start("Kenji", "Miko", "Ana");
  const openers: number[] = [table.turnIndex];
  for (const winner of ["p1", "p2", "p0"]) {
    let next = reducer({ ...table, phase: "ended", winnerId: winner }, { type: "RESTART" });
    while (next.phase === "deal") next = reducer(next, { type: "DEAL_NEXT" });
    openers.push(next.turnIndex);
    table = next;
  }
  check(openers.join() === "0,1,2,0", `each winner opens the next game (${openers.join()})`);
}

// ---------- what a client is allowed to see, and when ----------

/*
 * Redaction is the whole game. An unspent influence is its owner's alone while
 * there is still a game to lie in — and the moment there isn't, it belongs to
 * the table, because the reveal is what everybody stayed for.
 */
{
  let s = start("Ada", "Bo", "Cy");

  // ---- mid-game: your own hand and nobody else's ----
  {
    const mine = viewFor(s, "p0");
    const me = mine.players.find((p) => p.id === "p0")!;
    check(
      known(me.cards).length === 2,
      `you can name both of your own (${known(me.cards).length})`
    );
    for (const other of mine.players.filter((p) => p.id !== "p0")) {
      check(
        other.cards.every((c) => c.character === null),
        `${other.name}'s hand is hidden from you while the game runs`
      );
    }
    check(
      !JSON.stringify(mine).includes('"court"'),
      "and the court's order never reaches a client at all"
    );
  }

  // a spent card is public the moment it is spent, game or no game
  {
    const struck = {
      ...s,
      players: s.players.map((p) =>
        p.id === "p1" ? { ...p, cards: [{ ...p.cards[0], revealed: true }, p.cards[1]] } : p
      ),
    };
    const seen = viewFor(struck, "p0").players.find((p) => p.id === "p1")!;
    check(known(seen.cards).length === 1, "a surrendered influence is face up to everyone");
    check(seen.cards.filter((c) => c.character === null).length === 1, "the other still is not");
  }

  // ---- over: everything comes face up, to everybody ----
  {
    const ended: CoupState = { ...s, phase: "ended", winnerId: "p0" };
    for (const viewer of ["p0", "p1", "p2"]) {
      const view = viewFor(ended, viewer);
      for (const p of view.players) {
        check(
          known(p.cards).length === p.cards.length,
          `${viewer} sees all of ${p.name}'s hand once it is over`
        );
      }
    }
    /*
     * The losers are the point. The end screen leads on what the winner was
     * holding, and while that stayed redacted the section simply did not
     * render for anybody who lost — the people the reveal is for.
     */
    const loser = viewFor(ended, "p1");
    const winner = loser.players.find((p) => p.id === "p0")!;
    check(
      known(winner.cards).some((c) => !c.revealed),
      "including the influence that won it, which is what Still Standing draws"
    );
    // and it is still only the players' hands — not the deck
    check(!JSON.stringify(loser).includes('"court"'), "the court stays out of it even then");
  }

  // ---- and dealing again puts the lid back on ----
  {
    const again = reducer({ ...s, phase: "ended", winnerId: "p0" }, { type: "RESTART" });
    let fresh = again;
    while (fresh.phase === "deal") fresh = reducer(fresh, { type: "DEAL_NEXT" });
    const mine = viewFor(fresh, "p0");
    for (const other of mine.players.filter((p) => p.id !== "p0")) {
      check(
        other.cards.every((c) => c.character === null),
        `${other.name} is hidden again once a new game starts`
      );
    }
  }
}

// ---------- the cheat sheet says what the reducer does ----------

/*
 * The sheet is derived from ACTIONS rather than transcribed, and this is what
 * makes that worth doing: every rule a player can read has to be a rule the
 * game actually enforces, in both directions.
 */
{
  // every action in the game is on the sheet, once
  const listed = REFERENCE.map((r) => r.title);
  for (const kind of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) {
    check(listed.includes(ACTIONS[kind].label), `${ACTIONS[kind].label} is on the sheet`);
  }
  check(new Set(listed).size === listed.length, "and none of them twice");

  /*
   * Every block, from the blocking card's side. The sheet used to describe
   * these only inside the counter line of the action they stop, so a player
   * holding a Captain was told about Steal and nothing about the other half
   * of the card. The Contessa was the exception, hand-written — which is
   * exactly the kind of entry that goes stale.
   */
  const declared = new Set<string>();
  for (const kind of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) {
    for (const who of ACTIONS[kind].blockedBy) declared.add(`${who}:${ACTIONS[kind].label}`);
  }
  const shown = new Set(BLOCKS.map((b) => `${b.character}:${b.stops}`));
  for (const pair of Array.from(declared)) check(shown.has(pair), `the sheet lists that ${pair.replace(":", " blocks ")}`);
  for (const pair of Array.from(shown)) check(declared.has(pair), `${pair.replace(":", " blocks ")} is a rule, not sheet-only`);
  check(shown.size === declared.size, `no block is listed twice (${shown.size} of ${declared.size})`);

  // every character that can block appears, and one that cannot does not
  for (const c of ["duke", "captain", "ambassador", "contessa"] as const) {
    check(BLOCKS.some((b) => b.character === c), `${c} is named among the blocks`);
  }
  check(!BLOCKS.some((b) => b.character === "assassin"), "and the Assassin, who blocks nothing, is not");

  // who is allowed to claim it matches the rule the reducer applies
  for (const b of BLOCKS) {
    const kind = (Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]).find(
      (k) => ACTIONS[k].label === b.stops
    )!;
    check(
      b.targetOnly === (ACTIONS[kind].blockableBy === "target"),
      `${b.character} blocking ${b.stops}: the sheet agrees about who may claim it`
    );
  }
  check(
    BLOCKS.some((b) => !b.targetOnly) && BLOCKS.some((b) => b.targetOnly),
    "and the sheet distinguishes the two, since Foreign Aid is the odd one out"
  );
}

// ---------- proving a claim really does change the card ----------

/*
 * A player who proves a challenge puts the card back, the deck is shuffled,
 * and they draw a fresh one. It looks to a table as though nothing happened,
 * because the replacement arrives face down and — often enough to be noticed —
 * is the same character all over again. That is the rules working, not
 * failing: there are three of each character in fifteen cards, so the copy you
 * just returned is one of several in the pool.
 *
 * Which is exactly why it is worth measuring rather than eyeballing. A swap
 * that quietly did nothing would look identical at the table.
 */
{
  /** Seat 0 holds a Duke, claims Tax, is challenged, and proves it. */
  const proveOnce = (names: string[]) => {
    let s = start(...names);
    const seat = s.players[0];
    const duke = { ...seat.cards[0], character: "duke" as const };
    s = {
      ...s,
      players: s.players.map((p, i) => (i === 0 ? { ...p, cards: [duke, p.cards[1]] } : p)),
    };

    s = reducer(s, { type: "ACT", action: "tax" });
    s = reducer(s, { type: "CHALLENGE", challengerId: "p1" });
    const before = s.players[0].cards[0];
    const courtBefore = s.court.length;
    s = reducer(s, { type: "REVEAL" });
    const after = s.players[0].cards[0];
    return { before, after, courtBefore, courtAfter: s.court.length, state: s };
  };

  for (const names of [["Kenji", "Miko", "Ana"], ["Kenji", "Miko", "Ana", "Bo", "Cy", "Dee"]]) {
    const RUNS = 1500;
    let sameCard = 0;
    let sameCharacter = 0;
    let poolSize = 0;
    let faceUp = 0;
    let courtGrew = 0;

    for (let i = 0; i < RUNS; i++) {
      const r = proveOnce(names);
      poolSize = r.courtBefore + 1;
      if (r.after.id === r.before.id) sameCard++;
      if (r.after.character === "duke") sameCharacter++;
      // a card drawn from the deck is nobody's business but its owner's
      if (r.after.revealed) faceUp++;
      if (r.courtAfter !== r.courtBefore) courtGrew++;
      if (i === 0) checkConservation(r.state, `${names.length}-hand proven swap`);
    }

    const at = `${names.length} players`;
    check(faceUp === 0, `${at}: the replacement always comes face down (${faceUp} did not)`);
    check(courtGrew === 0, `${at}: the deck neither grows nor shrinks (${courtGrew} did)`);

    /*
     * A fair draw from a pool of N returns the same card 1/N of the time. Both
     * failures this pins down are silent: a swap that never happened would sit
     * at 100%, and one that deliberately avoided the card it just returned —
     * which is not the rule — would sit at 0.
     */
    const same = sameCard / RUNS;
    const fair = 1 / poolSize;
    check(
      Math.abs(same - fair) < 0.06,
      `${at}: the draw is fair — same card ${(same * 100).toFixed(1)}%, a pool of ${poolSize} predicts ${(fair * 100).toFixed(1)}%`
    );
    check(same > 0, `${at}: and it can return the card it just put back, as the rules allow`);
    check(
      sameCharacter > sameCard,
      `${at}: the same character comes back more often than the same card, since there are three of each (${sameCharacter} vs ${sameCard})`
    );
    check(
      sameCharacter < RUNS * 0.6,
      `${at}: but it is the minority — ${((sameCharacter / RUNS) * 100).toFixed(1)}% look unchanged to the table`
    );
  }
}

// ---------- the last proof is handed back, not swapped ----------

/*
 * Proving a claim swaps the card, which is right while there is a game left to
 * play it in. On the action that ends the game there is not: nothing is ever
 * done with the replacement, and the winner is left holding a card they never
 * used while the one that actually won it has gone into the deck.
 */
{
  /** Bo has one influence left, challenges Ada's Duke, and is wrong. */
  const endOnAProof = () => {
    let s = start("Ada", "Bo");
    const duke = { ...s.players[0].cards[0], character: "duke" as const };
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0
          ? { ...p, cards: [duke, p.cards[1]] }
          : { ...p, cards: [{ ...p.cards[0], revealed: true }, p.cards[1]] }
      ),
    };
    s = reducer(s, { type: "ACT", action: "tax" });
    s = reducer(s, { type: "CHALLENGE", challengerId: "p1" });
    s = reducer(s, { type: "REVEAL" });
    // Bo has to give up the last one, which ends it
    if (s.phase === "reveal" && s.reveal) {
      const mine = s.players[1].cards.find((c) => !c.revealed)!;
      s = reducer(s, { type: "LOSE", cardId: mine.id });
    }
    return s;
  };

  let held = 0;
  const RUNS = 400;
  for (let i = 0; i < RUNS; i++) {
    const s = endOnAProof();
    if (i === 0) {
      check(s.phase === "ended", `the proof ends the game (${s.phase})`);
      check(s.winnerId === "p0", `and Ada takes it (${s.winnerId})`);
    }
    if (s.phase !== "ended") continue;
    const live = s.players[0].cards.filter((c) => !c.revealed);
    if (live.some((c) => c.character === "duke")) held++;
    checkConservation(s, "won on a proof");
  }
  check(
    held === RUNS,
    `the winner keeps the card that won it, every time (${held} of ${RUNS})`
  );

  /*
   * And only then. A proof mid-game still swaps — that is the rule, and the
   * whole reason a player cannot bank on what somebody proved an hour ago.
   */
  let midGame = start("Ada", "Bo", "Cy");
  const duke = { ...midGame.players[0].cards[0], character: "duke" as const };
  midGame = {
    ...midGame,
    players: midGame.players.map((p, i) => (i === 0 ? { ...p, cards: [duke, p.cards[1]] } : p)),
  };
  midGame = reducer(midGame, { type: "ACT", action: "tax" });
  midGame = reducer(midGame, { type: "CHALLENGE", challengerId: "p1" });
  const beforeId = midGame.players[0].cards[0].id;
  midGame = reducer(midGame, { type: "REVEAL" });
  check(midGame.phase !== "ended", "the table is still standing");
  let changed = 0;
  for (let i = 0; i < 200; i++) {
    let s = start("Ada", "Bo", "Cy");
    const d = { ...s.players[0].cards[0], character: "duke" as const };
    s = { ...s, players: s.players.map((p, j) => (j === 0 ? { ...p, cards: [d, p.cards[1]] } : p)) };
    s = reducer(s, { type: "ACT", action: "tax" });
    s = reducer(s, { type: "CHALLENGE", challengerId: "p1" });
    const was = s.players[0].cards[0].id;
    s = reducer(s, { type: "REVEAL" });
    if (s.players[0].cards[0].id !== was) changed++;
  }
  check(changed > 150, `a proof mid-game still draws a fresh card (${changed} of 200)`);
  void beforeId;
}

if (failures === 0) console.log("ALL COUP TESTS PASSED");
else {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
}
