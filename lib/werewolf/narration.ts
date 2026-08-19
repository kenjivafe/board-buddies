import type { NightStep } from "@/lib/werewolf/types";

/**
 * The moderator's script, in the rulebook's own words. One phone means the app
 * *is* the narrator, so it calls roles the way a person would — by role, never
 * by name. Which people hold which card is exactly the thing the table is
 * trying to work out, and a line like "pass the phone to Ana" hands it to them
 * for free.
 *
 * Each call is kept in two pieces: the summons, which is what gets read out
 * loud and set in display type, and the instruction under it. `WAKE` glues them
 * back together, which is the line the audio will eventually be read from.
 */

/**
 * How long the table sits in the dark between one role and the next.
 *
 * The ellipsis in every call is a speech direction, not punctuation: it is the
 * beat a moderator leaves between the name and the instruction, so the right
 * person has time to realise it is them. The synthesiser reads it as a pause,
 * and the screen prints the same words, so the two never drift.
 */
export const BEAT_SECONDS = 5;

/**
 * The wood comes up before anybody is told anything.
 *
 * The very first beat of the night holds on a dark screen for this long while
 * the ambience rises, and only then says "Everyone... close your eyes." A
 * moderator waits for the room to settle before starting; opening on the line
 * itself gave the table no moment to go quiet in.
 */
export const LEAD_IN_SECONDS = 5;

export const OPENING = "Everyone... close your eyes.";

/** The summons. Short, because it is the line the whole table hears. */
export const CALL: Record<NightStep, string> = {
  werewolf: "Werewolves... wake up.",
  minion: "Minion... wake up.",
  mason: "Masons... wake up.",
  seer: "Seer... wake up.",
  robber: "Robber... wake up.",
  witch: "Witch... wake up.",
  troublemaker: "Troublemaker... wake up.",
  drunk: "Drunk... wake up.",
  insomniac: "Insomniac... wake up.",
};

/** What that role is being woken to do. */
export const INSTRUCTION: Record<NightStep, string> = {
  werewolf: "Look for other werewolves.",
  minion: "Werewolves, stick out your thumb so the Minion can see who you are.",
  mason: "Look for other Masons.",
  seer: "You may look at another player's card, or two of the centre cards.",
  robber:
    "You may exchange your card with another player's card, and then look at your new card.",
  witch:
    "You may look at a card in the centre. If you do, you must exchange it with any player's card.",
  troublemaker: "You may exchange cards between two other players.",
  drunk: "Exchange your card with a card from the centre.",
  insomniac: "Look at your card.",
};

/** The whole line, as it will be spoken. */
export const WAKE: Record<NightStep, string> = Object.fromEntries(
  (Object.keys(CALL) as NightStep[]).map((step) => [
    step,
    `${CALL[step]} ${INSTRUCTION[step]}`,
  ])
) as Record<NightStep, string>;

export const SLEEP: Record<NightStep, string> = {
  werewolf: "Werewolves... close your eyes.",
  minion: "Werewolves, thumbs down. Minion... close your eyes.",
  mason: "Masons... close your eyes.",
  seer: "Seer... close your eyes.",
  robber: "Robber... close your eyes.",
  witch: "Witch... close your eyes.",
  troublemaker: "Troublemaker... close your eyes.",
  drunk: "Drunk... close your eyes.",
  insomniac: "Insomniac... close your eyes.",
};

export const DAWN = "Everyone... wake up.";

/**
 * The same line, as the screen should print it.
 *
 * Every constant above is the **spoken** form: the ellipsis is a direction to
 * the synthesiser, telling it to leave a beat between the name and the
 * instruction. Printed, that beat is just ordinary punctuation — a reader does
 * not need to be told to pause, and three dots on a card of gold-leaf type
 * looks like a typo. So the audio keeps the ellipsis and the screen gets a
 * comma, from one source, derived rather than duplicated.
 */
export const shown = (line: string): string => line.replace(/\.\.\.\s*/g, ", ");

/** What the woken role is holding the phone to do, in the app's own voice. */
export const TASK: Record<NightStep, string> = {
  werewolf: "Find the rest of the pack.",
  minion: "Find out who you work for.",
  mason: "Find the other Mason.",
  seer: "One player's card, or two from the middle. Never both.",
  robber: "Take somebody's card, if you fancy it.",
  witch: "Turn over one card from the middle, if you dare.",
  troublemaker: "Swap two other people, if you like.",
  drunk: "Trade with the middle. You don't get a choice, or a look.",
  insomniac: "Check what you are actually holding now.",
};

/** The headline over each panel. */
export const TITLE: Record<NightStep, string> = {
  werewolf: "The pack",
  minion: "The Minion",
  mason: "The Masons",
  seer: "The Seer",
  robber: "The Robber",
  witch: "The Witch",
  troublemaker: "The Troublemaker",
  drunk: "The Drunk",
  insomniac: "The Insomniac",
};
