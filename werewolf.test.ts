import {
  actorsOf,
  cardOf,
  centreSlots,
  initialState,
  reducer,
  seatOf,
  type Action,
} from "./lib/werewolf/reducer";
import {
  CENTRE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NIGHT_ORDER,
  ROLES,
  ROLE_INFO,
  lineupProblem,
  suggestLineup,
  total,
} from "./lib/werewolf/roles";
import type { NightStep, OnuwState, Role } from "./lib/werewolf/types";
import { ALL_SEEING, viewFor } from "./lib/werewolf/view";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

const empty = () => Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;

const lineupOf = (...roles: Role[]): Record<Role, number> => {
  const l = empty();
  for (const r of roles) l[r]++;
  return l;
};

/**
 * Deals an exact table: `table([["Ana","seer"]], ["werewolf","villager","tanner"])`.
 * Cards are forced rather than shuffled so every scenario below is deterministic.
 */
function table(seats: [string, Role][], centre: Role[]): OnuwState {
  const slots = [...seats.map(([, r]) => r), ...centre];
  const lineup = lineupOf(...slots);
  let s = play(initialState(), {
    type: "START",
    players: seats.map(([name], i) => ({ id: `p${i}`, name })),
    lineup,
    discussionSeconds: 0,
  });
  check(s.phase === "deal", `table(): START refused a legal lineup (${lineupProblem(lineup, seats.length)})`);
  s = {
    ...s,
    slots,
    players: s.players.map((p, i) => ({ ...p, dealt: slots[i] })),
    notes: Object.fromEntries(
      s.players.map((p, i) => [
        p.id,
        [
          {
            step: "deal" as const,
            text: `You were dealt the ${ROLE_INFO[slots[i]].name}.`,
            cards: [{ role: slots[i], label: "Dealt to you" }],
          },
        ],
      ])
    ),
  };
  while (s.phase === "deal") s = play(s, { type: "DEAL_NEXT" });
  return s;
}

/**
 * Walks past a role nobody was dealt. Every role in the box is called now, so
 * a step with no actors sits there until whoever is pacing the night ticks it
 * along — the phone on one device, the host in a room.
 */
function settle(s: OnuwState): OnuwState {
  let cur = s;
  for (let guard = 0; guard < 24; guard++) {
    if (cur.phase !== "night" || !cur.step) return cur;
    if (actorsOf(cur, cur.step).length > 0) return cur;
    cur = reducer(cur, { type: "TICK" });
  }
  return cur;
}

/** One action, then straight past anything nobody has to answer. */
const play = (s: OnuwState, a: Action): OnuwState => settle(reducer(s, a));

const id = (s: OnuwState, name: string) => s.players.find((p) => p.name === name)!.id;
const nameAt = (s: OnuwState, playerId: string) => s.players.find((p) => p.id === playerId)!.name;
const step = (s: OnuwState) => s.step;
const notesOf = (s: OnuwState, name: string) => s.notes[id(s, name)] ?? [];
const lastNote = (s: OnuwState, name: string) => notesOf(s, name)[notesOf(s, name).length - 1];
const ack = (s: OnuwState, name: string, centreSlot?: number): OnuwState =>
  play(s, { type: "WAKE_ACK", playerId: id(s, name), centreSlot });

/** The cards in play must always be the cards that were dealt, wherever they've moved. */
function conserved(s: OnuwState, where: string) {
  const seen = empty();
  for (const role of s.slots) seen[role]++;
  const same = ROLES.every((r) => seen[r] === (s.lineup[r] ?? 0));
  check(same, `${where}: every card still accounted for`);
  check(
    s.slots.length === s.players.length + CENTRE,
    `${where}: ${s.players.length} seats plus three in the centre`
  );
}

// ---------- the box ----------

{
  check(
    lineupProblem(lineupOf("werewolf", "seer", "villager", "villager", "robber", "tanner"), 3) === null,
    "three players and six cards is legal"
  );
  check(
    lineupProblem(lineupOf("werewolf", "seer", "villager"), 3) !== null,
    "three players and three cards is not — the centre needs three of its own"
  );
  check(
    lineupProblem(lineupOf("werewolf", "werewolf", "werewolf", "seer", "villager", "tanner"), 3) !== null,
    "a third werewolf is not in the box"
  );
  check(
    lineupProblem(lineupOf("villager", "villager", "villager", "villager", "seer", "werewolf"), 3) !== null,
    "a fourth villager is not in the box either"
  );
  check(
    lineupProblem(lineupOf("mason", "werewolf", "seer", "villager", "robber", "tanner"), 3) !== null,
    "a lone Mason is refused"
  );
  check(
    lineupProblem(lineupOf("mason", "mason", "werewolf", "seer", "villager", "tanner"), 3) === null,
    "a pair of Masons is fine"
  );
  check(lineupProblem(suggestLineup(3), 2) !== null, "two players is below the minimum");

  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const box = suggestLineup(n);
    check(total(box) === n + CENTRE, `suggested box for ${n} deals ${n + CENTRE} cards`);
    check(lineupProblem(box, n) === null, `suggested box for ${n} is legal: ${lineupProblem(box, n)}`);
    check(box.werewolf >= 1, `suggested box for ${n} has a wolf in it somewhere`);
  }

  // START refuses an illegal box outright rather than dealing a broken game
  const refused = play(initialState(), {
    type: "START",
    players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}` })),
    lineup: lineupOf("werewolf", "villager"),
    discussionSeconds: 0,
  });
  check(refused.phase === "setup", "START refuses a box that doesn't fit the table");
}

// ---------- the deal ----------

{
  let s = play(initialState(), {
    type: "START",
    players: [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i}` })),
    lineup: suggestLineup(5),
    discussionSeconds: 0,
  });
  check(s.phase === "deal", "the deal gates the opening cards");
  conserved(s, "deal");

  let peeks = 0;
  while (s.phase === "deal" && peeks < 20) {
    s = play(s, { type: "DEAL_NEXT" });
    peeks++;
  }
  check(peeks === 5, `one peek per player, took ${peeks}`);
  check(s.phase === "night", "the fifth peek opens the night");
  check(s.slots.length === 8, "five seats and three in the middle");
  check(
    s.players.every((p, i) => p.dealt === s.slots[i]),
    "everyone's dealt card is the card in their seat"
  );
  check(
    s.players.every((p) => (s.notes[p.id] ?? []).length >= 1),
    "everyone starts their notebook knowing what they were dealt"
  );
}

// ---------- the wake order ----------

{
  const s = table(
    [
      ["Ana", "werewolf"],
      ["Bo", "minion"],
      ["Cy", "mason"],
      ["Dee", "mason"],
      ["Eve", "seer"],
      ["Fen", "robber"],
      ["Gus", "witch"],
      ["Hal", "troublemaker"],
      ["Ivy", "drunk"],
      ["Jo", "insomniac"],
    ],
    ["villager", "villager", "villager"]
  );

  const walked: NightStep[] = [];
  let cur = s;
  let guard = 0;
  while (cur.phase === "night" && guard++ < 30) {
    const at = cur.step!;
    walked.push(at);
    switch (at) {
      case "werewolf":
      case "minion":
      case "mason":
        for (const p of actorsOf(cur, at)) {
          cur = play(cur, { type: "WAKE_ACK", playerId: p.id });
        }
        break;
      case "seer":
        cur = play(cur, { type: "SEER", targetId: null, centreSlots: [] });
        break;
      case "robber":
        cur = play(cur, { type: "ROBBER", targetId: null });
        break;
      case "witch":
        cur = play(cur, { type: "WITCH_PASS" });
        break;
      case "troublemaker":
        cur = play(cur, { type: "TROUBLEMAKER", aId: null, bId: null });
        break;
      case "drunk":
        cur = play(cur, { type: "DRUNK", centreSlot: centreSlots(cur)[0] });
        break;
      case "insomniac":
        cur = play(cur, { type: "INSOMNIAC" });
        break;
    }
  }
  check(
    JSON.stringify(walked) === JSON.stringify(NIGHT_ORDER),
    `the night walks the rulebook order, saw ${walked.join(" → ")}`
  );
  check(cur.phase === "day", "and then the sun comes up");
  conserved(cur, "after a full night");
}

{
  // a role whose only card went to the centre wakes nobody at all
  const s = table(
    [
      ["Ana", "werewolf"],
      ["Bo", "villager"],
      ["Cy", "villager"],
    ],
    ["seer", "robber", "tanner"]
  );
  check(step(s) === "werewolf", "the pack opens the night");
  const after = ack(s, "Ana");
  check(after.phase === "day", "with the Seer and Robber in the centre, nobody else wakes");
}

// ---------- the pack ----------

{
  const two = table(
    [
      ["Ana", "werewolf"],
      ["Bo", "werewolf"],
      ["Cy", "villager"],
    ],
    ["seer", "villager", "tanner"]
  );
  check(
    lastNote(two, "Ana").text.includes("Bo") && lastNote(two, "Bo").text.includes("Ana"),
    "two wolves are shown each other the moment the step opens"
  );
  const half = ack(two, "Ana");
  check(step(half) === "werewolf", "the night waits for the second wolf");
  const both = ack(half, "Bo");
  check(both.phase === "day", "and moves on once they have both looked");

  const alone = table(
    [
      ["Ana", "werewolf"],
      ["Bo", "villager"],
      ["Cy", "villager"],
    ],
    ["werewolf", "seer", "tanner"]
  );
  check(
    lastNote(alone, "Ana").text.includes("only werewolf"),
    "a lone wolf is told they are alone"
  );

  // and may look at one card in the middle — the one privilege of being alone
  const peeked = ack(alone, "Ana", centreSlots(alone)[0]);
  const note = lastNote(peeked, "Ana");
  check(note.cards.length === 1 && note.cards[0].role === "werewolf", "the lone wolf's peek shows a real card");
  check(peeked.phase === "day", "and the night moves on");

  const twoWolvesNoPeek = ack(ack(two, "Ana", centreSlots(two)[0]), "Bo");
  check(
    (twoWolvesNoPeek.notes[id(two, "Ana")] ?? []).every((n) => n.cards.length <= 1),
    "a wolf with company gets no peek at the centre"
  );
}

// ---------- the minion ----------

{
  const withPack = table(
    [
      ["Ana", "werewolf"],
      ["Bo", "minion"],
      ["Cy", "villager"],
    ],
    ["seer", "villager", "tanner"]
  );
  const atMinion = ack(withPack, "Ana");
  check(step(atMinion) === "minion", "the minion follows the pack");
  check(lastNote(atMinion, "Bo").text.includes("Ana"), "and is shown who the pack is");
  check(
    !(atMinion.notes[id(atMinion, "Ana")] ?? []).some((n) => n.text.includes("Bo")),
    "while the pack is never shown the minion"
  );

  const noPack = table(
    [
      ["Ana", "minion"],
      ["Bo", "villager"],
      ["Cy", "villager"],
    ],
    ["werewolf", "seer", "tanner"]
  );
  check(step(noPack) === "minion", "with every wolf in the centre the minion opens the night");
  check(
    lastNote(noPack, "Ana").text.includes("on your own"),
    "and is told there is no pack at all"
  );
}

// ---------- the masons ----------

{
  const pair = table(
    [
      ["Ana", "mason"],
      ["Bo", "mason"],
      ["Cy", "villager"],
    ],
    ["werewolf", "seer", "tanner"]
  );
  check(lastNote(pair, "Ana").text.includes("Bo"), "the masons see each other");
  check(ack(ack(pair, "Ana"), "Bo").phase === "day", "and both have to look");

  const lonely = table(
    [
      ["Ana", "mason"],
      ["Bo", "villager"],
      ["Cy", "villager"],
    ],
    ["mason", "werewolf", "tanner"]
  );
  check(
    lastNote(lonely, "Ana").text.includes("centre"),
    "a mason who wakes alone learns the other card is in the middle"
  );
}

// ---------- the seer ----------

{
  const base = ack(
    table(
    [
      ["Ana", "seer"],
      ["Bo", "werewolf"],
      ["Cy", "villager"],
    ],
    ["tanner", "robber", "villager"]
    ),
    "Bo"
  );
  check(step(base) === "seer", "the seer follows the pack");

  const onPlayer = play(base, { type: "SEER", targetId: id(base, "Bo"), centreSlots: [] });
  const seen = lastNote(onPlayer, "Ana");
  check(seen.cards.length === 1 && seen.cards[0].role === "werewolf", "the seer reads a player's real card");

  const [c0, c1] = centreSlots(base);
  const onCentre = play(base, { type: "SEER", targetId: null, centreSlots: [c0, c1] });
  const pairSeen = lastNote(onCentre, "Ana");
  check(pairSeen.cards.length === 2, "or two of the three in the middle");
  check(
    pairSeen.cards[0].role === "tanner" && pairSeen.cards[1].role === "robber",
    "and they are the cards that are actually there"
  );

  const onSelf = play(base, { type: "SEER", targetId: id(base, "Ana"), centreSlots: [] });
  check(step(onSelf) === "seer", "the seer cannot read her own card");
  const three = play(base, { type: "SEER", targetId: null, centreSlots: [c0, c1, centreSlots(base)[2]] });
  check(lastNote(three, "Ana").cards.length === 2, "and never more than two from the middle");
  const twice = play(base, { type: "SEER", targetId: null, centreSlots: [c0, c0] });
  check(step(twice) === "seer", "nor the same centre card twice");
}

// ---------- the robber ----------

{
  const base = ack(
    table(
    [
      ["Ana", "robber"],
      ["Bo", "werewolf"],
      ["Cy", "villager"],
    ],
    ["seer", "tanner", "villager"]
    ),
    "Bo"
  );
  const robbed = play(base, { type: "ROBBER", targetId: id(base, "Bo") });
  check(cardOf(robbed, id(base, "Ana")) === "werewolf", "the robber takes the card");
  check(cardOf(robbed, id(base, "Bo")) === "robber", "and leaves their own behind");
  check(
    lastNote(robbed, "Ana").cards[0].role === "werewolf",
    "and gets to look at what they took"
  );
  check(
    !(robbed.notes[id(base, "Bo")] ?? []).some((n) => n.text.includes("took")),
    "the person robbed is told nothing at all"
  );
  check(robbed.players.find((p) => p.name === "Ana")!.dealt === "robber", "what they were dealt does not change");
  conserved(robbed, "after a robbery");

  const declined = play(base, { type: "ROBBER", targetId: null });
  check(cardOf(declined, id(base, "Ana")) === "robber", "a robber who keeps their hands to themselves keeps their card");
  const self = play(base, { type: "ROBBER", targetId: id(base, "Ana") });
  check(step(self) === "robber", "and cannot rob themselves");
}

// ---------- the witch ----------

{
  const base = ack(
    table(
    [
      ["Ana", "witch"],
      ["Bo", "werewolf"],
      ["Cy", "villager"],
    ],
    ["tanner", "seer", "villager"]
    ),
    "Bo"
  );
  const [c0] = centreSlots(base);

  // she looks first, and the card is shown to her before she has to place it
  const looked = play(base, { type: "WITCH_LOOK", centreSlot: c0 });
  check(step(looked) === "witch", "looking does not end her turn");
  check(looked.witchSaw === c0, "the card she is holding up is remembered");
  check(
    lastNote(looked, "Ana").cards[0].role === "tanner",
    "and she is shown what it actually is"
  );
  check(
    JSON.stringify(looked.slots) === JSON.stringify(base.slots),
    "nothing has moved yet"
  );

  const planted = play(looked, { type: "WITCH_PLACE", targetId: id(base, "Bo") });
  check(cardOf(planted, id(base, "Bo")) === "tanner", "the witch plants the card she looked at");
  check(planted.slots[c0] === "werewolf", "and the card she displaced goes to the middle");
  check(
    !lastNote(planted, "Ana").text.includes("Werewolf"),
    "she never sees what she covered up"
  );
  check(planted.phase === "day", "and placing it ends her turn");
  conserved(planted, "after the witch");

  const onSelf = play(looked, { type: "WITCH_PLACE", targetId: id(base, "Ana") });
  check(cardOf(onSelf, id(base, "Ana")) === "tanner", "she may plant it on herself");

  const declined = play(base, { type: "WITCH_PASS" });
  check(
    JSON.stringify(declined.slots) === JSON.stringify(base.slots),
    "a witch who does not look moves nothing"
  );
  check(declined.phase === "day", "and that ends her turn too");
  check(
    step(play(looked, { type: "WITCH_PASS" })) === "witch",
    "but once she has looked she cannot back out"
  );
  check(
    play(looked, { type: "WITCH_LOOK", centreSlot: centreSlots(base)[1] }).witchSaw === c0,
    "nor look at a second card"
  );
}

// ---------- the troublemaker ----------

{
  const base = ack(
    table(
    [
      ["Ana", "troublemaker"],
      ["Bo", "werewolf"],
      ["Cy", "villager"],
    ],
    ["seer", "tanner", "villager"]
    ),
    "Bo"
  );
  const swapped = play(base, { type: "TROUBLEMAKER", aId: id(base, "Bo"), bId: id(base, "Cy") });
  check(cardOf(swapped, id(base, "Bo")) === "villager", "two other players change places");
  check(cardOf(swapped, id(base, "Cy")) === "werewolf", "both ways round");
  check(lastNote(swapped, "Ana").cards.length === 0, "and the troublemaker sees neither card");
  check(
    !(swapped.notes[id(base, "Bo")] ?? []).some((n) => n.text.includes("swapped")),
    "nor is anybody told it happened to them"
  );
  conserved(swapped, "after the troublemaker");

  const includesSelf = play(base, { type: "TROUBLEMAKER", aId: id(base, "Ana"), bId: id(base, "Bo") });
  check(step(includesSelf) === "troublemaker", "the troublemaker cannot swap themselves in");
  const same = play(base, { type: "TROUBLEMAKER", aId: id(base, "Bo"), bId: id(base, "Bo") });
  check(step(same) === "troublemaker", "nor one person with themselves");
}

// ---------- the drunk ----------

{
  const base = ack(
    table(
    [
      ["Ana", "drunk"],
      ["Bo", "werewolf"],
      ["Cy", "villager"],
    ],
    ["tanner", "seer", "villager"]
    ),
    "Bo"
  );
  const [, c1] = centreSlots(base);
  const swapped = play(base, { type: "DRUNK", centreSlot: c1 });
  check(cardOf(swapped, id(base, "Ana")) === "seer", "the drunk takes a card from the middle");
  check(swapped.slots[c1] === "drunk", "and leaves their own there");
  check(lastNote(swapped, "Ana").cards.length === 0, "without ever seeing it");
  conserved(swapped, "after the drunk");

  const bogus = play(base, { type: "DRUNK", centreSlot: 0 });
  check(step(bogus) === "drunk", "a seat is not a centre card");
}

// ---------- the insomniac, and the whole chain ----------

{
  // Robber → Troublemaker → Drunk all move cards, and the Insomniac wakes last
  // to find out what is left of her
  let s = table(
    [
      ["Ana", "robber"],
      ["Bo", "troublemaker"],
      ["Cy", "drunk"],
      ["Dee", "insomniac"],
      ["Eve", "werewolf"],
    ],
    ["tanner", "seer", "villager"]
  );

  s = play(s, { type: "WAKE_ACK", playerId: id(s, "Eve") });
  check(step(s) === "robber", "the pack, then the robber");
  s = play(s, { type: "ROBBER", targetId: id(s, "Dee") });
  check(cardOf(s, id(s, "Ana")) === "insomniac", "the robber becomes the insomniac");
  check(cardOf(s, id(s, "Dee")) === "robber", "and the insomniac is now holding the robber");

  check(step(s) === "troublemaker", "the troublemaker is next");
  s = play(s, { type: "TROUBLEMAKER", aId: id(s, "Dee"), bId: id(s, "Eve") });
  check(cardOf(s, id(s, "Dee")) === "werewolf", "who hands the insomniac a werewolf");

  check(step(s) === "drunk", "then the drunk");
  s = play(s, { type: "DRUNK", centreSlot: centreSlots(s)[0] });
  check(cardOf(s, id(s, "Cy")) === "tanner", "who is now the tanner and has no idea");

  check(step(s) === "insomniac", "and the insomniac goes last");
  // she still acts, because she was DEALT the insomniac — even though the card
  // has long since left her
  s = play(s, { type: "INSOMNIAC" });
  const woke = lastNote(s, "Dee");
  check(woke.cards[0].role === "werewolf", "she checks her card and finds a werewolf");
  check(woke.text.includes("Werewolf"), "and is told so in as many words");
  check(s.phase === "day", "then morning");
  conserved(s, "after the whole chain");

  const untouched = (() => {
    let q = table(
      [
        ["Ana", "insomniac"],
        ["Bo", "werewolf"],
        ["Cy", "villager"],
      ],
      ["seer", "tanner", "villager"]
    );
    q = play(q, { type: "WAKE_ACK", playerId: id(q, "Bo") });
    return play(q, { type: "INSOMNIAC" });
  })();
  check(
    lastNote(untouched, "Ana").text.includes("Still the Insomniac"),
    "an untouched insomniac is told nothing happened"
  );
}

// ---------- the vote ----------

/** Walks a finished night into an open ballot. */
function toVote(s: OnuwState): OnuwState {
  let cur = s;
  let guard = 0;
  while (cur.phase === "night" && guard++ < 30) {
    const at = cur.step!;
    if (at === "werewolf" || at === "minion" || at === "mason") {
      for (const p of actorsOf(cur, at)) cur = play(cur, { type: "WAKE_ACK", playerId: p.id });
    } else if (at === "seer") cur = play(cur, { type: "SEER", targetId: null, centreSlots: [] });
    else if (at === "robber") cur = play(cur, { type: "ROBBER", targetId: null });
    else if (at === "witch") cur = play(cur, { type: "WITCH_PASS" });
    else if (at === "troublemaker") cur = play(cur, { type: "TROUBLEMAKER", aId: null, bId: null });
    else if (at === "drunk") cur = play(cur, { type: "DRUNK", centreSlot: centreSlots(cur)[0] });
    else if (at === "insomniac") cur = play(cur, { type: "INSOMNIAC" });
  }
  return play(cur, { type: "OPEN_VOTE" });
}

const pointAll = (s: OnuwState, at: Record<string, string>): OnuwState => {
  let cur = s;
  for (const [voter, target] of Object.entries(at)) {
    cur = play(cur, { type: "VOTE", voterId: id(s, voter), targetId: id(s, target) });
  }
  return cur;
};

{
  const base = toVote(
    table(
      [
        ["Ana", "werewolf"],
        ["Bo", "villager"],
        ["Cy", "villager"],
        ["Dee", "seer"],
      ],
      ["tanner", "robber", "villager"]
    )
  );
  check(base.phase === "vote", "the host opens the ballot");

  const half = play(base, { type: "VOTE", voterId: id(base, "Ana"), targetId: id(base, "Bo") });
  check(half.phase === "vote", "the count waits for everybody to point");

  const hanged = pointAll(base, { Ana: "Bo", Bo: "Ana", Cy: "Ana", Dee: "Ana" });
  check(hanged.phase === "ended", "the last point ends it");
  check(
    JSON.stringify(hanged.outcome!.killed) === JSON.stringify([id(base, "Ana")]),
    "the most votes dies"
  );
  check(hanged.outcome!.teams.includes("village"), "and killing the wolf wins it for the village");

  // everyone with one vote each: nobody dies
  const scattered = pointAll(base, { Ana: "Bo", Bo: "Cy", Cy: "Dee", Dee: "Ana" });
  check(scattered.outcome!.killed.length === 0, "one vote each kills nobody");
  check(scattered.outcome!.teams.includes("werewolf"), "which is a win for the wolf in the room");

  // a tie at two apiece takes both
  const tied = pointAll(base, { Ana: "Bo", Cy: "Bo", Bo: "Cy", Dee: "Cy" });
  check(tied.outcome!.killed.length === 2, "a tie at the top kills everyone tied");

  const self = play(base, { type: "VOTE", voterId: id(base, "Ana"), targetId: id(base, "Ana") });
  check(Object.keys(self.votes).length === 0, "nobody may point at themselves");
}

// ---------- the prince ----------

{
  const base = toVote(
    table(
      [
        ["Ana", "prince"],
        ["Bo", "werewolf"],
        ["Cy", "villager"],
        ["Dee", "villager"],
      ],
      ["tanner", "seer", "villager"]
    )
  );

  const saved = pointAll(base, { Bo: "Ana", Cy: "Ana", Dee: "Ana", Ana: "Bo" });
  check(saved.outcome!.princeSaved.length === 3, "votes against the prince are thrown out");
  check(
    saved.outcome!.killed.length === 0,
    "and with nobody else on two votes, the village kills no one"
  );
  check(saved.outcome!.teams.includes("werewolf"), "which hands it to the wolf");

  const second = pointAll(base, { Bo: "Ana", Cy: "Ana", Dee: "Bo", Ana: "Bo" });
  check(
    JSON.stringify(second.outcome!.killed) === JSON.stringify([id(base, "Bo")]),
    "the runner-up hangs instead"
  );

  // the protection follows the CARD, not the seat: rob the prince and you take it
  let moved = table(
    [
      ["Ana", "prince"],
      ["Bo", "robber"],
      ["Cy", "werewolf"],
      ["Dee", "villager"],
    ],
    ["tanner", "seer", "villager"]
  );
  moved = play(moved, { type: "WAKE_ACK", playerId: id(moved, "Cy") });
  moved = play(moved, { type: "ROBBER", targetId: id(moved, "Ana") });
  check(cardOf(moved, id(moved, "Bo")) === "prince", "the robber is holding the prince now");
  const after = pointAll(play(moved, { type: "OPEN_VOTE" }), {
    Ana: "Bo",
    Cy: "Bo",
    Dee: "Bo",
    Bo: "Cy",
  });
  check(after.outcome!.princeSaved.length === 3, "and it is the robber who is now untouchable");
}

// ---------- the hunter ----------

{
  const base = toVote(
    table(
      [
        ["Ana", "hunter"],
        ["Bo", "werewolf"],
        ["Cy", "villager"],
        ["Dee", "villager"],
      ],
      ["tanner", "seer", "villager"]
    )
  );
  const shot = pointAll(base, { Bo: "Ana", Cy: "Ana", Dee: "Ana", Ana: "Bo" });
  check(shot.outcome!.killed.includes(id(base, "Ana")), "the hunter hangs");
  check(shot.outcome!.hunterShot === id(base, "Bo"), "and takes whoever they pointed at");
  check(shot.outcome!.killed.includes(id(base, "Bo")), "who dies with them");
  check(shot.outcome!.teams.includes("village"), "which still wins it for the village");
}

// ---------- the tanner ----------

{
  const base = toVote(
    table(
      [
        ["Ana", "tanner"],
        ["Bo", "werewolf"],
        ["Cy", "villager"],
        ["Dee", "villager"],
      ],
      ["prince", "seer", "villager"]
    )
  );

  const got = pointAll(base, { Bo: "Ana", Cy: "Ana", Dee: "Ana", Ana: "Bo" });
  check(got.outcome!.winners.includes(id(base, "Ana")), "the tanner wins by dying");
  check(!got.outcome!.teams.includes("werewolf"), "and the pack loses its win with him");
  check(!got.outcome!.teams.includes("village"), "and so does the village");

  // two apiece takes the tanner AND the wolf, which is the one case where the
  // tanner and the village both go home happy
  const both = pointAll(base, { Cy: "Ana", Bo: "Ana", Ana: "Bo", Dee: "Bo" });
  check(both.outcome!.killed.length === 2, "a tie at two apiece kills them both");
  check(both.outcome!.teams.includes("tanner"), "the tanner wins when he dies alongside a wolf");
  check(both.outcome!.teams.includes("village"), "and so does the village");
}

// ---------- no werewolves in play ----------

{
  const base = toVote(
    table(
      [
        ["Ana", "villager"],
        ["Bo", "villager"],
        ["Cy", "seer"],
      ],
      ["werewolf", "tanner", "prince"]
    )
  );
  const quiet = pointAll(base, { Ana: "Bo", Bo: "Cy", Cy: "Ana" });
  check(quiet.outcome!.killed.length === 0, "one vote each kills nobody");
  check(quiet.outcome!.teams.includes("village"), "and with every wolf in the centre the village wins");

  const mistake = pointAll(base, { Ana: "Bo", Cy: "Bo", Bo: "Ana" });
  check(mistake.outcome!.killed.length === 1, "hanging an innocent");
  check(mistake.outcome!.teams.length === 0, "with no wolves and no minion, nobody wins at all");
}

{
  // the minion alone, with every wolf card in the centre
  const base = toVote(
    table(
      [
        ["Ana", "minion"],
        ["Bo", "villager"],
        ["Cy", "seer"],
      ],
      ["werewolf", "werewolf", "prince"]
    )
  );
  const won = pointAll(base, { Ana: "Bo", Cy: "Bo", Bo: "Ana" });
  check(won.outcome!.killed.includes(id(base, "Bo")), "the village hangs an innocent");
  check(won.outcome!.winners.includes(id(base, "Ana")), "and the minion wins on his own");

  const lost = pointAll(base, { Bo: "Ana", Cy: "Ana", Ana: "Bo" });
  check(lost.outcome!.killed.includes(id(base, "Ana")), "hang the minion instead");
  check(!lost.outcome!.winners.includes(id(base, "Ana")), "and he wins nothing");
}

{
  // the minion loses with the pack only when a wolf actually dies
  const base = toVote(
    table(
      [
        ["Ana", "minion"],
        ["Bo", "werewolf"],
        ["Cy", "villager"],
        ["Dee", "villager"],
      ],
      ["tanner", "seer", "villager"]
    )
  );
  const survived = pointAll(base, { Ana: "Cy", Bo: "Cy", Cy: "Dee", Dee: "Ana" });
  check(survived.outcome!.winners.includes(id(base, "Ana")), "no wolf died, so the minion wins too");
  const caught = pointAll(base, { Ana: "Bo", Cy: "Bo", Dee: "Bo", Bo: "Cy" });
  check(!caught.outcome!.winners.includes(id(base, "Ana")), "a dead wolf takes the minion down with it");
}

// ---------- redaction ----------

{
  let s = table(
    [
      ["Ana", "werewolf"],
      ["Bo", "werewolf"],
      ["Min", "minion"],
      ["Cy", "seer"],
      ["Dee", "robber"],
      ["Eve", "villager"],
    ],
    ["tanner", "prince", "villager"]
  );

  const villager = viewFor(s, id(s, "Eve"));
  const wolf = viewFor(s, id(s, "Ana"));

  check(
    villager.players.filter((p) => p.dealt !== null).length === 1,
    `a player's view names exactly one dealt card — their own`
  );
  check(
    villager.players.find((p) => p.name === "Eve")!.dealt === "villager",
    "and it is theirs"
  );
  check(
    wolf.players.filter((p) => p.dealt !== null).length === 1,
    "even a wolf's view names only their own card — the pack arrives as a note"
  );
  check(
    (wolf.self!.notes ?? []).some((n) => n.text.includes("Bo")),
    "the pack reaches a wolf through their own notebook"
  );
  check(
    !(villager.self!.notes ?? []).some((n) => n.text.includes("Ana")),
    "and never reaches anybody else's"
  );

  check(villager.players.every((p) => p.final === null), "where the cards actually are is nobody's business");
  check(villager.centre.every((c) => c === null), "and neither is the middle");

  // The middle stays face down for EVERYBODY while the game is running — the
  // one-phone device included. Nothing ever needs to draw a face-up centre
  // card before the end: the roles that get to look at one choose it blind and
  // are told what it was afterwards, in their own notebook.
  const shared = viewFor(s, ALL_SEEING);
  check(shared.centre.every((c) => c === null), "the middle is face down even on one phone");
  check(
    shared.players.every((p) => p.final === null),
    "and one phone is not told where the cards have ended up either"
  );
  check(
    !JSON.stringify(shared.table).includes("slots"),
    "the one-phone payload carries notebooks, not a map of the cards"
  );
  check(villager.step === null, "a sleeping player is not even told whose step it is");
  check(wolf.step === "werewolf", "the wolf whose step it is is told");
  check(villager.table === null, "a seated player is never handed the whole table");
  check(viewFor(s, ALL_SEEING).table !== null, "the one-phone device is — the gates are what keep it honest");

  /*
   * Two fields are public on purpose, and everything else is scrubbed against
   * them: the box, which is what the whole day argument is built on, and the
   * narration cue, which is the line being said out loud. The cue is only safe
   * because every role in the box is called whether or not anybody holds it —
   * if the night skipped the empty ones, this field would announce exactly
   * which roles are in the middle.
   */
  check(villager.narrate === "werewolf", "the narration cue names the step being called");
  check(villager.step === null, "…while the villager's own screen still stays dark");
  const scrub = (v: unknown) =>
    JSON.stringify({ ...(v as object), lineup: null, narrate: null });
  const payload = scrub(villager);
  check(!JSON.stringify(villager).includes('"past"'), "the undo stack never reaches the wire");
  check(!JSON.stringify(villager).includes('"slots"'), "nor does the map of where every card is");
  check(!payload.includes("werewolf"), "and outside the box, the word never reaches a villager");

  // the seer's reading is hers, and stays hers
  s = ack(ack(s, "Ana"), "Bo");
  s = ack(s, "Min");
  s = play(s, { type: "SEER", targetId: id(s, "Ana"), centreSlots: [] });
  const seer = viewFor(s, id(s, "Cy"));
  const other = viewFor(s, id(s, "Eve"));
  check(
    seer.self!.notes.some((n) => n.cards.some((c) => c.role === "werewolf")),
    "the seer keeps what she saw"
  );
  check(!scrub(other).includes("werewolf"), "and nobody else gets a word of it");

  // ballots stay sealed until the count is read out
  let voting = toVote(s);
  voting = play(voting, { type: "VOTE", voterId: id(voting, "Ana"), targetId: id(voting, "Eve") });
  const mid = viewFor(voting, id(voting, "Eve"));
  check(mid.votedIds.length === 1, "the table sees that somebody has pointed");
  check(mid.ballots === null, "but not who at");
  check(mid.myVote === undefined, "a player who has not pointed knows they have not");
  check(viewFor(voting, id(voting, "Ana")).myVote === id(voting, "Eve"), "and you can see your own");

  // ...and everything opens up at the end
  const done = pointAll(voting, { Bo: "Eve", Min: "Eve", Cy: "Eve", Dee: "Eve", Eve: "Ana" });
  const ended = viewFor(done, id(done, "Eve"));
  check(ended.players.every((p) => p.dealt !== null && p.final !== null), "the end shows every card");
  check(ended.centre.every((c) => c !== null), "including the three in the middle");
  check(ended.ballots !== null, "and every ballot");
}

// ---------- the roster is internally consistent ----------

{
  check(ROLES.length === Object.keys(ROLE_INFO).length, "every role has a card");
  check(ROLES.length === 13, `thirteen roles, saw ${ROLES.length}`);
  check(
    NIGHT_ORDER.every((s) => ROLES.includes(s as Role)),
    "every night step is named after a real role"
  );
  check(
    ROLES.filter((r) => ROLE_INFO[r].night !== null).length === NIGHT_ORDER.length,
    "and every role that acts at night has a step"
  );
  check(
    ROLES.filter((r) => ROLE_INFO[r].team === "werewolf").length === 2,
    "two roles sit on the pack's side"
  );
  check(ROLE_INFO.tanner.team === "tanner", "and the tanner is on nobody's");
}

// ---------- fuzz ----------

{
  const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
  const maybe = (p: number) => Math.random() < p;
  let games = 0;

  for (let game = 0; game < 400; game++) {
    const seats = MIN_PLAYERS + Math.floor(Math.random() * (MAX_PLAYERS - MIN_PLAYERS + 1));
    const lineup = suggestLineup(seats);

    // shuffle the box around a bit, keeping it legal
    for (let swap = 0; swap < 6; swap++) {
      const out = pick(ROLES.filter((r) => lineup[r] > 0));
      const into = pick(ROLES.filter((r) => lineup[r] < ROLE_INFO[r].copies));
      const step = into === "mason" ? 2 : 1;
      const back = out === "mason" ? 2 : 1;
      if (lineup[out] < back || lineup[into] + step > ROLE_INFO[into].copies) continue;
      const trial = { ...lineup, [out]: lineup[out] - back, [into]: lineup[into] + step };
      if (lineupProblem(trial, seats) === null) Object.assign(lineup, trial);
    }
    if (lineupProblem(lineup, seats)) continue;
    games++;

    let s = play(initialState(), {
      type: "START",
      players: Array.from({ length: seats }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      lineup,
      discussionSeconds: 0,
    });

    for (let turn = 0; turn < 200 && s.phase !== "ended"; turn++) {
      conserved(s, `fuzz game ${game}`);
      const others = (self: string) => s.players.filter((p) => p.id !== self);
      const centre = centreSlots(s);

      if (s.phase === "deal") {
        s = play(s, { type: "DEAL_NEXT" });
        continue;
      }
      if (s.phase === "day") {
        s = play(s, { type: "OPEN_VOTE" });
        continue;
      }
      if (s.phase === "vote") {
        const voter = s.players.find((p) => !(p.id in s.votes))!;
        s = play(s, { type: "VOTE", voterId: voter.id, targetId: pick(others(voter.id)).id });
        continue;
      }

      const at = s.step!;
      const actor = actorsOf(s, at)[0];
      const before = JSON.stringify({ ...s, past: [] });
      const action: Action = (() => {
        switch (at) {
          case "werewolf":
          case "minion":
          case "mason": {
            const owed = actorsOf(s, at).find((a) => !s.acked.includes(a.id))!;
            return {
              type: "WAKE_ACK",
              playerId: owed.id,
              centreSlot: maybe(0.5) ? pick(centre) : undefined,
            };
          }
          case "seer":
            return maybe(0.5)
              ? { type: "SEER", targetId: pick(others(actor.id)).id, centreSlots: [] }
              : { type: "SEER", targetId: null, centreSlots: [centre[0], centre[2]] };
          case "robber":
            return { type: "ROBBER", targetId: maybe(0.8) ? pick(others(actor.id)).id : null };
          case "witch":
            if (s.witchSaw !== null) return { type: "WITCH_PLACE", targetId: pick(s.players).id };
            return maybe(0.7)
              ? { type: "WITCH_LOOK", centreSlot: pick(centre) }
              : { type: "WITCH_PASS" };
          case "troublemaker": {
            const two = others(actor.id);
            return two.length >= 2
              ? { type: "TROUBLEMAKER", aId: two[0].id, bId: two[1].id }
              : { type: "TROUBLEMAKER", aId: null, bId: null };
          }
          case "drunk":
            return { type: "DRUNK", centreSlot: pick(centre) };
          case "insomniac":
            return { type: "INSOMNIAC" };
        }
      })();

      s = play(s, action);
      if (JSON.stringify({ ...s, past: [] }) === before) {
        throw new Error(`fuzz: ${action.type} changed nothing at step ${at}`);
      }
    }

    check(s.phase === "ended", `fuzz game ${game} finished`);
    const outcome = s.outcome!;
    conserved(s, `fuzz game ${game} end`);

    // whatever happened, the verdict has to agree with the cards on the table
    const finalOf = (pid: string) => cardOf(s, pid)!;
    const wolfDied = outcome.killed.some((k) => finalOf(k) === "werewolf");
    const wolvesOut = s.players.some((p) => finalOf(p.id) === "werewolf");
    if (wolfDied) check(outcome.teams.includes("village"), "a dead wolf is a village win");
    if (!wolfDied && wolvesOut && !outcome.killed.some((k) => finalOf(k) === "tanner")) {
      check(outcome.teams.includes("werewolf"), "a live pack with no losses wins");
    }
    if (outcome.killed.some((k) => finalOf(k) === "tanner")) {
      check(outcome.teams.includes("tanner"), "a dead tanner always wins");
    }
    for (const id of outcome.killed) {
      check(
        finalOf(id) === "prince" ? outcome.hunterShot === id : true,
        "a prince only ever dies to the hunter"
      );
    }
  }

  check(games > 100, `fuzz: ${games} legal games played`);
}

if (failures === 0) console.log("ALL WEREWOLF TESTS PASSED");
else {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
}
