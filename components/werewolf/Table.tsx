"use client";

import { ROLE_INFO } from "@/lib/werewolf/roles";
import type { Note, Role } from "@/lib/werewolf/types";
import type { OnuwView, PlayerView } from "@/lib/werewolf/view";
import {
  CardBack,
  CardFace,
  CardSlot,
  Person,
  RoleBrief,
  Rule,
  Swapped,
  sizeForCount,
  tint,
} from "./Bits";

/**
 * The people a night role can choose between, as the cards in front of them.
 *
 * Reaching for somebody's card at night *is* what these roles do, and the three
 * in the middle are already picked this way — so a player is a face-down card
 * with their name under it, on the same grid, and the two kinds of choice look
 * like the same action because they are.
 *
 * The day vote deliberately does NOT use this; see `PickNames`.
 */
export function PickList({
  people,
  selected,
  onPick,
  tagFor,
  label,
}: {
  people: PlayerView[];
  selected: string[];
  onPick: (id: string) => void;
  tagFor?: (p: PlayerView) => string | null;
  label: string;
}) {
  return (
    <ul className="pick-grid" aria-label={label}>
      {people.map((p) => {
        const on = selected.includes(p.id);
        const tag = tagFor?.(p) ?? null;
        return (
          <li key={p.id}>
            <button className="pick-card" aria-pressed={on} onClick={() => onPick(p.id)}>
              <CardBack />
              <span className="pick-card-name">{p.name}</span>
              {tag && <span className="pick-card-tag">{tag}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The same choice as a list of names.
 *
 * The ballot uses this rather than the card grid. At the vote every card on
 * the table is face down and identical, so a row of card backs carries no
 * information at all — and with ten players it is four screens of scrolling
 * to do the one thing everybody does at once. A name is quicker to find and
 * quicker to hit.
 */
export function PickNames({
  people,
  selected,
  onPick,
  tagFor,
  label,
}: {
  people: PlayerView[];
  selected: string[];
  onPick: (id: string) => void;
  tagFor?: (p: PlayerView) => string | null;
  label: string;
}) {
  return (
    <ul className="pick-list" aria-label={label}>
      {people.map((p) => {
        const on = selected.includes(p.id);
        const tag = tagFor?.(p) ?? null;
        return (
          <li key={p.id}>
            <button className="pick" aria-pressed={on} onClick={() => onPick(p.id)}>
              <span className="pick-mark" aria-hidden>
                {on ? "✓" : ""}
              </span>
              <span className="pick-name">{p.name}</span>
              {tag && <span className="pick-tag">{tag}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The three in the middle, as things you can point at.
 *
 * Always face down, without exception. Every role that gets to look at one of
 * these — the lone werewolf, the Seer, the Witch — chooses it blind and is
 * told what it was afterwards, through their own notebook. Nothing here is
 * ever allowed to draw the face, so no change to the view can turn this into a
 * board that shows the whole table the answer.
 */
export function CentrePick({
  slots,
  selected,
  onPick,
  reasonNot,
}: {
  slots: number[];
  selected: number[];
  onPick: (slot: number) => void;
  reasonNot?: (slot: number) => boolean;
}) {
  return (
    <div className="centre-pick" role="group" aria-label="The three cards in the middle">
      {slots.map((slot, i) => (
        <button
          key={slot}
          className="centre-card"
          aria-pressed={selected.includes(slot)}
          aria-label={`Centre card ${i + 1}`}
          disabled={reasonNot?.(slot) ?? false}
          onClick={() => onPick(slot)}
        >
          <CardSlot role={null} caption={["First", "Second", "Third"][i]} />
        </button>
      ))}
    </div>
  );
}

/**
 * Who is at the table. Nothing about anybody's card, because nobody knows.
 *
 * A face and a name rather than a row each. The roster carries one fact per
 * player and a stacked list of full-width plates spent a screen's worth of
 * height saying it — on ten players it pushed everything that matters off the
 * bottom. Side by side, it is a table you can take in at a glance, which is
 * what a roster is for.
 */
export function Board({ view, label = "At the table" }: { view: OnuwView; label?: string }) {
  return (
    <section className="ww-section" aria-label={label}>
      <span className="eyebrow">
        {label} · {view.players.length}
      </span>
      <ul className="faces">
        {view.players.map((p) => (
          <li className={`face${p.id === view.selfId ? " you" : ""}`} key={p.id}>
            <span className="face-ring">
              <Person />
            </span>
            <span className="face-name">{p.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything you found out tonight, in the order you found it out. */
export function Notebook({
  notes,
  label = "Your notebook",
  freshFrom = 0,
}: {
  notes: Note[];
  label?: string;
  /** notes from this index on are highlighted as new */
  freshFrom?: number;
}) {
  // "You were dealt the …" is already the card sitting on the screen; the
  // notebook is for what you *found out*
  const learned = notes.filter((n) => n.step !== "deal");
  if (learned.length === 0) return null;
  return (
    <section className="ww-section" aria-label={label}>
      <span className="eyebrow">{label}</span>
      <ul className="notebook">
        {learned.map((n, i) => (
          <li className={`note${i >= freshFrom ? " fresh" : ""}`} key={i}>
            <p className="note-text">{n.text}</p>
            <NoteCards cards={n.cards} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What a role has just been shown, at the size it deserves.
 *
 * Being shown a card is the whole reward for waking up, so it is not boxed
 * into a notebook entry and shrunk to a thumbnail — the text sits above it and
 * the card gets the width of the screen.
 */
const ORDINAL = ["First", "Second", "Third"];

/**
 * The cards attached to one note.
 *
 * Shared by the notebook and the big reveal so they cannot drift: a centre
 * look draws the whole middle in both, and it was only ever the reveal that
 * did — going back to the notebook to check turned three cards back into one
 * thumbnail, which is exactly when you want the other two.
 *
 * `compact` is the notebook, which is a log and wants thumbnails.
 */
/**
 * What you were holding, and what you are holding now.
 *
 * The card that left is small and the card that arrived is full size, because
 * they are not two facts of equal weight: one of them is who you are for the
 * rest of the game and the other is who you used to be.
 */
export function Swap({
  was,
  now,
  compact = false,
}: {
  was: Role;
  now: Role;
  compact?: boolean;
}) {
  return (
    <div className="swap">
      <CardSlot role={was} caption="Was yours" size="sm" />
      <span className="swap-arrow">
        <Swapped size={compact ? 18 : 22} />
      </span>
      <CardSlot role={now} caption="Yours now" size={compact ? "sm" : "md"} />
    </div>
  );
}

function NoteCards({ cards, compact = false }: { cards: Note["cards"]; compact?: boolean }) {
  if (cards.length === 0) return null;

  // a note about your own card changing hands is drawn as the swap it is
  const left = cards.find((c) => c.was);
  const arrived = cards.find((c) => !c.was);
  if (left && arrived) return <Swap was={left.role} now={arrived.role} compact={compact} />;

  /*
   * The three in the middle, with the ones nobody turned over face down.
   * *Which* of the three you saw is a real part of what you know — a Seer who
   * took the first and the second can tell the table that the third is still
   * unaccounted for — and one thumbnail threw that away.
   */
  if (cards.some((c) => c.centre !== undefined)) {
    return (
      // `trio` sizes three cards to the width of the screen rather than
      // leaving them as thumbnails; being shown a card is the whole reward
      // for waking up, so the reveal gets that and the log does not
      <div className={compact ? "card-row" : "card-row trio"}>
        {ORDINAL.map((name, slot) => {
          const looked = cards.find((c) => c.centre === slot);
          return (
            <CardSlot
              key={slot}
              role={looked?.role ?? null}
              caption={name}
              size={compact ? "sm" : "md"}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="card-row">
      {cards.map((c, j) => (
        <CardSlot
          key={j}
          role={c.role}
          caption={c.label}
          size={compact ? "sm" : sizeForCount(cards.length)}
        />
      ))}
    </div>
  );
}

export function Shown({ notes, label }: { notes: Note[]; label?: string }) {
  if (notes.length === 0) return null;
  return (
    <section aria-label={label ?? "What you were shown"}>
      {label && <span className="eyebrow">{label}</span>}
      {notes.map((n, i) => (
        <div className="told" key={i}>
          <p className="told-text">{n.text}</p>
          <NoteCards cards={n.cards} />
        </div>
      ))}
    </section>
  );
}

/**
 * Your own card, on your own device, for the whole game.
 *
 * Drawn the way the deal draws it on one phone — a card with its name under
 * it — rather than as a thumbnail in a strip. It is the single most important
 * thing on the screen in a room, and it was the smallest.
 */
/**
 * Three roles act on the card in front of *them* rather than on somebody
 * else's: the Robber takes one, the Drunk trades one away blind, and the
 * Insomniac checks what hers has become. Whatever they are told is a statement
 * about the card they are holding, so it belongs in "Your card" — and nowhere
 * else, or the same swap gets drawn twice on one screen.
 *
 * Everything else a player learns — the pack, the Masons, the Seer's look, the
 * Witch's meddling — is about other people's cards, and stays in what they
 * found out.
 */
const OWN_CARD_STEPS = ["robber", "drunk", "insomniac"];
export const aboutYourOwnCard = (note: Note) => OWN_CARD_STEPS.includes(note.step);

export function YouAre({ view }: { view: OnuwView }) {
  const self = view.self;
  if (!self) return null;

  /*
   * What you have been told about your own card, if anything. It says what you
   * *know*, which is the only thing the game is willing to say: the Drunk gets
   * a sentence and no card at all, because trading blind is precisely not
   * finding anything out.
   */
  const mine = [...self.notes].reverse().find(aboutYourOwnCard);
  const was = mine?.cards.find((c) => c.was)?.role;
  const now = mine?.cards.find((c) => !c.was)?.role;
  const holding = now ?? self.dealt;

  return (
    <section className="you-are" aria-label="The card you are holding">
      <Rule>Your card</Rule>
      {mine && <p className="told-text">{mine.text}</p>}
      {was && now ? (
        <Swap was={was} now={now} />
      ) : (
        <div className="you-are-card">
          <CardFace role={holding} size="md" />
        </div>
      )}
      <RoleBrief role={holding} />
      <p className="hint">
        {was
          ? "Somebody took yours. You act on what you were dealt and win with what you hold."
          : mine && !now
            ? "You act on the card you were dealt, whatever it has since become."
            : "What you hold at the end is what you win with, and it may not be this."}
      </p>
    </section>
  );
}


export { tint };
