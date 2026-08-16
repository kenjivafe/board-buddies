"use client";

import { useState } from "react";
import { rankLabel, SUIT_COLOR, SUIT_GLYPH } from "@/lib/deck";
import { RULES } from "@/lib/rules";
import type { GameState } from "@/lib/types";

export function Sheet({
  title,
  sub,
  children,
  onClose,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function PickPlayerSheet({
  state,
  title,
  sub,
  excludeId,
  onPick,
}: {
  state: GameState;
  title: string;
  sub: string;
  excludeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <Sheet title={title} sub={sub}>
      <div className="pick-grid">
        {state.players.map((p) => (
          <button
            key={p.id}
            className="pick-btn"
            disabled={p.id === excludeId}
            onClick={() => onPick(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function KingRuleSheet({
  authorName,
  onSet,
}: {
  authorName: string;
  onSet: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <Sheet title="King's Rule" sub={`${authorName} makes the rule. It stands until the next King.`}>
      <input
        className="text-input"
        style={{ width: "100%" }}
        placeholder="e.g. No first names"
        value={text}
        maxLength={80}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSet(text)}
        autoFocus
      />
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={() => onSet("")}>
          Said out loud
        </button>
        <button className="btn btn-gold" onClick={() => onSet(text)} disabled={!text.trim()}>
          Set rule
        </button>
      </div>
    </Sheet>
  );
}

export function HistorySheet({ state, onClose }: { state: GameState; onClose: () => void }) {
  const rows = [...state.drawn].reverse();
  return (
    <Sheet title="Drawn so far" sub={`${state.drawn.length} of 52`} onClose={onClose}>
      {rows.length === 0 ? (
        <p className="confirm-text">Nothing yet. Draw the first card.</p>
      ) : (
        <ul className="history-list">
          {rows.map((d, i) => {
            const who = state.players.find((p) => p.id === d.playerId)?.name ?? "?";
            return (
              <li className="history-row" key={i}>
                <span className={`mini-card ${SUIT_COLOR[d.card.suit]}`}>
                  {rankLabel(d.card.rank)}
                  {SUIT_GLYPH[d.card.suit]}
                </span>
                <span className="h-rule">{RULES[d.card.rank].title}</span>
                <span className="h-meta">
                  {who}
                  {d.note ? ` · ${d.note}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onClose} style={{ width: "100%" }}>
          Close
        </button>
      </div>
    </Sheet>
  );
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <p className="confirm-text">{body}</p>
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className={`btn ${danger ? "btn-oxblood" : "btn-gold"}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
