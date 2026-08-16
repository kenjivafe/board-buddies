"use client";

import { useMemo, useState } from "react";
import type { Action } from "@/lib/reducer";
import { instructionFor, RULES } from "@/lib/rules";
import type { GameState } from "@/lib/types";
import PlayingCard from "./PlayingCard";
import { ConfirmSheet, HistorySheet, KingRuleSheet, PickPlayerSheet, Sheet } from "./Sheets";

const DRINK_RANKS = new Set([2, 3, 4, 5, 6, 7]);

export default function Play({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [aceSheet, setAceSheet] = useState(false);

  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? "?";

  const upNext = state.players[state.turnIndex];
  const current = state.current;
  const drawer = current ? nameOf(current.playerId) : null;

  const instruction = useMemo(
    () => (current ? instructionFor(state, current.playerId) : ""),
    [state, current]
  );

  const aceHolders = state.players.filter((p) => (state.aceTokens[p.id] ?? 0) > 0);
  const mateLinks = Object.entries(state.mates);

  const rank = current?.card.rank;
  const titleClass =
    rank && rank >= 11 ? "royal" : rank && DRINK_RANKS.has(rank) ? "drink" : "";

  return (
    <>
      {/* status rail */}
      <nav className="rail" aria-label="Table status">
        {state.kingMode === "cup" ? (
          <span className="chip chip-gold">
            <span className="tag">Cup</span>
            <span className="cup-meter" aria-label={`${state.kingsDrawn} of 4 kings drawn`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`cup-dot${i < state.kingsDrawn ? " full" : ""}`} />
              ))}
            </span>
          </span>
        ) : (
          state.kingRule && (
            <span className="chip chip-gold chip-rule">
              <span className="tag">Rule</span>
              <b>{state.kingRule.text}</b>
            </span>
          )
        )}
        {state.thumbMasterId && (
          <span className="chip chip-gold">
            <span className="tag">Thumb</span>
            <b>{nameOf(state.thumbMasterId)}</b>
          </span>
        )}
        {state.questionMasterId && (
          <span className="chip chip-gold">
            <span className="tag">Question</span>
            <b>{nameOf(state.questionMasterId)}</b>
          </span>
        )}
        {aceHolders.length > 0 && (
          <button className="chip chip-ace" onClick={() => setAceSheet(true)}>
            <span className="tag">Trump</span>
            <b>
              {aceHolders
                .map((p) => `${p.name}${(state.aceTokens[p.id] ?? 0) > 1 ? ` ×${state.aceTokens[p.id]}` : ""}`)
                .join(", ")}
            </b>
          </button>
        )}
        {mateLinks.map(([a, b]) => (
          <span className="chip" key={a}>
            <span className="tag">Mates</span>
            <b>
              {nameOf(a)} {"\u2192"} {nameOf(b)}
            </b>
          </span>
        ))}
      </nav>

      {/* stage */}
      <section className="stage">
        <div className="turn-banner">
          <p className="eyebrow">{current ? "Up next" : "First draw"}</p>
          <p className="who">{upNext?.name}</p>
        </div>

        <PlayingCard card={current?.card ?? null} faceUp={!!current} remaining={state.deck.length} />

        <div className="rule-poster" aria-live="polite">
          {current && rank ? (
            <>
              <h2 className={`rule-title ${titleClass}`}>{RULES[rank].title}</h2>
              <p className="rule-text">{instruction}</p>
              {current.note && <p className="rule-note">{current.note}</p>}
              <p className="rule-note" style={{ color: "var(--muted)" }}>
                Drawn by {drawer}
              </p>
            </>
          ) : (
            <p className="tap-hint">Tap Draw to flip the first card.</p>
          )}
        </div>
      </section>

      {/* bottom bar */}
      <footer className="bottom-bar">
        <button className="bar-btn" onClick={() => setShowHistory(true)}>
          History
        </button>
        <button
          className="draw-btn"
          onClick={() => dispatch({ type: "DRAW" })}
          disabled={!!state.pending || state.deck.length === 0}
        >
          Draw {upNext ? `· ${upNext.name}` : ""}
        </button>
        <span style={{ display: "flex", gap: 8 }}>
          <button
            className="bar-btn"
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={state.past.length === 0}
            aria-label="Undo last draw"
          >
            Undo
          </button>
          <button className="bar-btn" onClick={() => setConfirmRestart(true)} aria-label="Restart game">
            {"\u21BA"}
          </button>
        </span>
      </footer>

      {/* pending interactions */}
      {state.pending === "pick-target" && current && (
        <PickPlayerSheet
          state={state}
          title="You"
          sub={`${nameOf(current.playerId)} picks who drinks.`}
          excludeId={current.playerId}
          onPick={(id) => dispatch({ type: "PICK_PLAYER", targetId: id })}
        />
      )}
      {state.pending === "pick-mate" && current && (
        <PickPlayerSheet
          state={state}
          title="Mate"
          sub={`When ${nameOf(current.playerId)} drinks, their mate drinks too.`}
          excludeId={current.playerId}
          onPick={(id) => dispatch({ type: "PICK_PLAYER", targetId: id })}
        />
      )}
      {state.pending === "king-rule" && current && (
        <KingRuleSheet
          authorName={nameOf(current.playerId)}
          onSet={(text) => dispatch({ type: "SET_KING_RULE", text })}
        />
      )}

      {/* utility sheets */}
      {showHistory && <HistorySheet state={state} onClose={() => setShowHistory(false)} />}
      {confirmRestart && (
        <ConfirmSheet
          title="Reshuffle the deck?"
          body="Same players, fresh 52 cards. The current game is wiped — masters, mates, and the cup all reset."
          confirmLabel="Reshuffle"
          danger
          onConfirm={() => {
            dispatch({ type: "RESTART" });
            setConfirmRestart(false);
          }}
          onCancel={() => setConfirmRestart(false)}
        />
      )}
      {aceSheet && (
        <Sheet title="Trump Cards" sub="Tap a holder to spend one and skip a drink." onClose={() => setAceSheet(false)}>
          <div className="pick-grid">
            {aceHolders.map((p) => (
              <button
                key={p.id}
                className="pick-btn"
                onClick={() => {
                  dispatch({ type: "USE_ACE", playerId: p.id });
                  setAceSheet(false);
                }}
              >
                {p.name} · {state.aceTokens[p.id]}
              </button>
            ))}
          </div>
          <div className="sheet-actions">
            <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => setAceSheet(false)}>
              Close
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
