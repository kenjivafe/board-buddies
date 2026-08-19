"use client";

import { ROLE_INFO } from "@/lib/werewolf/roles";
import type { Note } from "@/lib/werewolf/types";
import type { OnuwView, PlayerView } from "@/lib/werewolf/view";
import { CardBack, CardFace, CardSlot, RoleBrief, Rule, sizeForCount, tint } from "./Bits";

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

/** Who is at the table. Nothing about anybody's card, because nobody knows. */
export function Board({ view, label = "At the table" }: { view: OnuwView; label?: string }) {
  return (
    <section className="ww-section" aria-label={label}>
      <span className="eyebrow">
        {label} · {view.players.length}
      </span>
      <ul className="board">
        {view.players.map((p) => (
          <li className={`board-row${p.id === view.selfId ? " you" : ""}`} key={p.id}>
            <span className="board-name">{p.name}</span>
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
            {n.cards.length > 0 && (
              <div className="card-row">
                {n.cards.map((c, j) => (
                  <CardSlot key={j} role={c.role} caption={c.label} size="sm" />
                ))}
              </div>
            )}
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
export function Shown({ notes, label }: { notes: Note[]; label?: string }) {
  if (notes.length === 0) return null;
  return (
    <section aria-label={label ?? "What you were shown"}>
      {label && <span className="eyebrow">{label}</span>}
      {notes.map((n, i) => (
        <div className="told" key={i}>
          <p className="told-text">{n.text}</p>
          {n.cards.length > 0 && (
            <div className="card-row">
              {n.cards.map((c, j) => (
                <CardSlot
                  key={j}
                  role={c.role}
                  caption={c.label}
                  size={sizeForCount(n.cards.length)}
                />
              ))}
            </div>
          )}
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
export function YouAre({ view }: { view: OnuwView }) {
  const self = view.self;
  if (!self) return null;

  return (
    <section className="you-are" aria-label="The card you were dealt">
      <Rule>Your card</Rule>
      <div className="you-are-card">
        <CardFace role={self.dealt} size="md" />
      </div>
      <RoleBrief role={self.dealt} />
      <p className="hint">
        What you hold at the end is what you win with, and it may not be this.
      </p>
    </section>
  );
}


export { tint };
