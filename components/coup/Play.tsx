"use client";

import { useState } from "react";
import { CHARACTER_INFO } from "@/lib/coup/deck";
import type { Action } from "@/lib/coup/reducer";
import {
  ACTIONS,
  claimText,
  eligibleBlockers,
  FORCED_COUP_AT,
  legalActions,
  othersAlive,
  responders,
} from "@/lib/coup/rules";
import type { ActionKind, Character } from "@/lib/coup/types";
import { known, type CoupView, type PlayerView } from "@/lib/coup/view";
import { CardFace } from "./Cards";
import { PassGate, PeekHand } from "./PassGate";
import Table, { Feed } from "./Table";
import Beats from "./Beats";
import Reference from "./Reference";

/**
 * One screen for both ways of playing. On a shared phone the view is
 * all-seeing and a pass gate protects each hand; on separate devices the view
 * is redacted and every panel is gated on whether it is your call to make.
 */
export default function Play({
  state,
  dispatch,
  canUndo = false,
}: {
  state: CoupView;
  dispatch: React.Dispatch<Action>;
  canUndo?: boolean;
}) {
  const [showRules, setShowRules] = useState(false);
  const actor = state.players[state.turnIndex];
  const marked = state.pending?.targetId ? [state.pending.targetId] : undefined;

  return (
    <>
      <header className="play-head">
        <span className="eyebrow">
          {state.phase === "turn" ? `${actor?.name}'s move` : "The table decides"}
        </span>
        <span className="play-head-tools">
          <button className="pill-btn" onClick={() => setShowRules(true)}>
            Cheat sheet
          </button>
          {canUndo && (
            <button
              className="icon-btn"
              onClick={() => dispatch({ type: "UNDO" })}
              aria-label="Undo the last step"
            >
              ↶
            </button>
          )}
        </span>
      </header>

      <Table state={state} highlight={marked} />
      <Beats beats={state.beats} />
      <Feed state={state} />

      {showRules && <Reference onClose={() => setShowRules(false)} />}

      <div className="panel">
        {state.phase === "turn" && <TurnPanel state={state} dispatch={dispatch} />}
        {state.phase === "reaction" && <ReactionPanel state={state} dispatch={dispatch} />}
        {state.phase === "block" && <BlockPanel state={state} dispatch={dispatch} />}
        {state.phase === "showdown" && <ShowdownPanel state={state} dispatch={dispatch} />}
        {state.phase === "reveal" && <RevealPanel state={state} dispatch={dispatch} />}
        {state.phase === "exchange" && <ExchangePanel state={state} dispatch={dispatch} />}
      </div>
    </>
  );
}

/** Everything that is somebody else's move looks like this. */
function Waiting({ who, what }: { who: string; what: string }) {
  return (
    <div className="waiting">
      <span className="waiting-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <p className="waiting-text">
        <strong>{who}</strong> {what}
      </p>
    </div>
  );
}

// ---------- pick a move ----------

function TurnPanel({ state, dispatch }: { state: CoupView; dispatch: React.Dispatch<Action> }) {
  const [choice, setChoice] = useState<ActionKind | null>(null);
  const actor = state.players[state.turnIndex];
  const mine = state.omniscient || state.selfId === actor?.id;

  if (!mine) return <Waiting who={actor?.name ?? "Someone"} what="is choosing a move." />;

  const legal = legalActions(state);
  const forced = actor.coins >= FORCED_COUP_AT;

  if (choice) {
    const info = ACTIONS[choice];
    return (
      <TargetPick
        title={`${info.label} — who?`}
        players={othersAlive(state, actor.id)}
        onPick={(id) => {
          dispatch({ type: "ACT", action: choice, targetId: id });
          setChoice(null);
        }}
        onCancel={() => setChoice(null)}
      />
    );
  }

  return (
    <>
      {forced && <p className="notice">Ten coins in hand — you must launch a coup.</p>}
      <div className="action-grid">
        {legal.map((kind) => {
          const info = ACTIONS[kind];
          return (
            <button
              className="action-btn"
              key={kind}
              style={info.claim ? { ["--c" as string]: `var(--${info.claim})` } : undefined}
              onClick={() => {
                if (info.needsTarget) setChoice(kind);
                else dispatch({ type: "ACT", action: kind });
              }}
            >
              <span className="action-top">
                <span className="action-label">{info.label}</span>
                {info.cost > 0 && <span className="action-cost">−{info.cost}</span>}
              </span>
              <span className="action-blurb">{info.blurb}</span>
              {info.claim && (
                <span className="action-claim">as the {CHARACTER_INFO[info.claim].name}</span>
              )}
            </button>
          );
        })}
      </div>
      {state.omniscient && <PeekOwn key={actor.id} player={actor} />}
    </>
  );
}

function PeekOwn({ player }: { player: PlayerView }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn btn-ghost peek-open" onClick={() => setOpen(true)}>
        Remind me what I hold
      </button>
    );
  }
  return (
    <div className="peek-wrap">
      <PeekHand cards={known(player.cards)} />
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>
        Done
      </button>
    </div>
  );
}

// ---------- the table answers a claim ----------

function ReactionPanel({ state, dispatch }: { state: CoupView; dispatch: React.Dispatch<Action> }) {
  const [mode, setMode] = useState<"none" | "challenge" | "block">("none");
  const pending = state.pending!;
  const info = ACTIONS[pending.action];
  const actorName = state.players.find((p) => p.id === pending.actorId)?.name ?? "";
  const targetName = state.players.find((p) => p.id === pending.targetId)?.name ?? null;
  const blockers = eligibleBlockers(state);
  const challengers = pending.claim ? othersAlive(state, pending.actorId) : [];

  const claim = (
    <Claim
      text={claimText(actorName, pending.action, targetName)}
      character={pending.claim}
      note={
        info.claim ? "Anyone may call this a lie." : "No character claimed — nobody can challenge it."
      }
    />
  );

  // ---- separate devices: you answer only for yourself ----
  if (!state.omniscient) {
    return (
      <>
        {claim}
        <SelfResponse
          state={state}
          dispatch={dispatch}
          canChallenge={Boolean(pending.claim)}
          blockClaims={blockers.some((b) => b.id === state.selfId) ? info.blockedBy : []}
        />
      </>
    );
  }

  // ---- one phone: the table speaks with one voice ----
  if (mode === "challenge") {
    return (
      <TargetPick
        title="Who calls the bluff?"
        players={challengers}
        onPick={(id) => dispatch({ type: "CHALLENGE", challengerId: id })}
        onCancel={() => setMode("none")}
      />
    );
  }

  if (mode === "block") {
    return (
      <BlockPick
        blockers={blockers}
        claims={info.blockedBy}
        onPick={(blockerId, character) => dispatch({ type: "BLOCK", blockerId, claim: character })}
        onCancel={() => setMode("none")}
      />
    );
  }

  return (
    <>
      {claim}
      <div className="reaction-row">
        <button className="btn btn-primary" onClick={() => dispatch({ type: "ALLOW" })}>
          Let it stand
        </button>
        {challengers.length > 0 && (
          <button className="btn btn-danger" onClick={() => setMode("challenge")}>
            Challenge
          </button>
        )}
        {blockers.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setMode("block")}>
            Block
          </button>
        )}
      </div>
    </>
  );
}

// ---------- the table answers a block ----------

function BlockPanel({ state, dispatch }: { state: CoupView; dispatch: React.Dispatch<Action> }) {
  const [picking, setPicking] = useState(false);
  const pending = state.pending!;
  const blockerName = state.players.find((p) => p.id === pending.blockerId)?.name ?? "";
  const character = pending.blockClaim!;

  const claim = (
    <Claim
      text={`${blockerName} claims the ${CHARACTER_INFO[character].name} and blocks.`}
      character={character}
      note="Challenge the block, or let it stand."
    />
  );

  if (!state.omniscient) {
    return (
      <>
        {claim}
        <SelfResponse state={state} dispatch={dispatch} canChallenge blockClaims={[]} />
      </>
    );
  }

  if (picking) {
    return (
      <TargetPick
        title="Who calls the bluff?"
        players={othersAlive(state, pending.blockerId)}
        onPick={(id) => dispatch({ type: "CHALLENGE", challengerId: id })}
        onCancel={() => setPicking(false)}
      />
    );
  }

  return (
    <>
      {claim}
      <div className="reaction-row">
        <button className="btn btn-primary" onClick={() => dispatch({ type: "ALLOW" })}>
          Let it stand
        </button>
        <button className="btn btn-danger" onClick={() => setPicking(true)}>
          Challenge the block
        </button>
      </div>
    </>
  );
}

/**
 * Room mode: your own buttons, plus who the table is still waiting on. The
 * action resolves once every responder has passed.
 */
function SelfResponse({
  state,
  dispatch,
  canChallenge,
  blockClaims,
}: {
  state: CoupView;
  dispatch: React.Dispatch<Action>;
  canChallenge: boolean;
  blockClaims: Character[];
}) {
  const [pickingBlock, setPickingBlock] = useState(false);
  const pending = state.pending!;
  const self = state.selfId;
  const eligible = responders(state);
  const mine = eligible.some((p) => p.id === self);
  const waitingOn = eligible.filter((p) => !pending.passed.includes(p.id));

  const roster = (
    <p className="waiting-on">
      {waitingOn.length === 0
        ? "Everyone has answered."
        : `Still deciding: ${waitingOn.map((p) => p.name).join(", ")}`}
    </p>
  );

  if (!mine || (self && pending.passed.includes(self))) {
    return (
      <div className="waiting">
        <span className="waiting-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <p className="waiting-text">Waiting on the table.</p>
        {roster}
      </div>
    );
  }

  if (pickingBlock && blockClaims.length > 1) {
    return (
      <div className="picker">
        <p className="choose-title">Block with which card?</p>
        <div className="pick-grid">
          {blockClaims.map((character) => (
            <button
              className="pick-btn"
              key={character}
              style={{ ["--c" as string]: `var(--${character})` }}
              onClick={() => dispatch({ type: "BLOCK", blockerId: self!, claim: character })}
            >
              <span className="pick-name">{CHARACTER_INFO[character].name}</span>
              <span className="pick-meta">{CHARACTER_INFO[character].counter}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setPickingBlock(false)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="reaction-row">
        {canChallenge && (
          <button
            className="btn btn-danger"
            onClick={() => dispatch({ type: "CHALLENGE", challengerId: self! })}
          >
            Challenge — I say that&apos;s a lie
          </button>
        )}
        {blockClaims.length > 0 && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (blockClaims.length === 1) {
                dispatch({ type: "BLOCK", blockerId: self!, claim: blockClaims[0] });
              } else {
                setPickingBlock(true);
              }
            }}
          >
            Block it
          </button>
        )}
        <button className="btn btn-primary" onClick={() => dispatch({ type: "PASS", playerId: self! })}>
          Let it stand
        </button>
      </div>
      {roster}
    </>
  );
}

// ---------- answering a challenge ----------

/**
 * The challenged player turns their own card over. There is no decision here —
 * proving a true claim is always better than conceding — so this is a reveal,
 * not a choice. What it buys is the moment: the table watches them answer
 * instead of being told the result, and a bluffer concedes rather than being
 * announced by the app before they have moved.
 */
function ShowdownPanel({ state, dispatch }: { state: CoupView; dispatch: React.Dispatch<Action> }) {
  const showdown = state.showdown!;
  const claimant = state.players.find((p) => p.id === showdown.claimantId)!;
  const challenger = state.players.find((p) => p.id === showdown.challengerId)?.name ?? "Someone";
  const label = CHARACTER_INFO[showdown.claim].name;
  const mine = state.omniscient || state.selfId === claimant.id;

  if (!mine) return <Waiting who={claimant.name} what={`must answer for the ${label}.`} />;

  // works it out from their own hand — the state never carries the answer
  const holds = known(claimant.cards).some(
    (c) => !c.revealed && c.character === showdown.claim
  );

  const answer = (
    <div className="showdown">
      <p className="choose-title">
        {challenger} called your {label}.
      </p>
      <button
        className={`btn ${holds ? "btn-primary" : "btn-danger"}`}
        onClick={() => dispatch({ type: "REVEAL" })}
      >
        {holds ? `Show the ${label}` : "Admit it — I was bluffing"}
      </button>
      <p className="hint">
        {holds
          ? "It goes back to the court and you draw a replacement."
          : "You'll choose which influence to give up."}
      </p>
    </div>
  );

  // On a shared phone the label alone would give the answer away to everyone
  // watching, so it waits behind the gate until the right person is holding it.
  if (state.omniscient) {
    return (
      <PassGate
        key={claimant.id}
        name={claimant.name}
        note={`${challenger} challenged your ${label}.`}
        cta={`I'm ${claimant.name}`}
      >
        {answer}
      </PassGate>
    );
  }

  return answer;
}

// ---------- give up an influence ----------

function RevealPanel({ state, dispatch }: { state: CoupView; dispatch: React.Dispatch<Action> }) {
  const reveal = state.reveal!;
  const player = state.players.find((p) => p.id === reveal.playerId)!;
  const live = known(player.cards).filter((c) => !c.revealed);
  const mine = state.omniscient || state.selfId === player.id;

  if (!mine) return <Waiting who={player.name} what="is giving up an influence." />;

  const choice = (
    <div className="choose">
      <p className="choose-title">Turn one face up. It is out of the game for good.</p>
      <div className="choose-cards">
        {live.map((card) => (
          <CardFace
            key={card.id}
            character={card.character}
            onClick={() => dispatch({ type: "LOSE", cardId: card.id })}
            label="Give up"
          />
        ))}
      </div>
    </div>
  );

  // On your own device the reason is already private, so no gate is needed.
  if (!state.omniscient) {
    return (
      <>
        <p className="notice">{reveal.reason}</p>
        {choice}
      </>
    );
  }

  // A failed challenge can be followed straight away by the assassination it
  // was defending against, so the gate must reset between the two reveals
  // rather than staying open for whoever is next.
  const gateKey = `${player.id}-${player.cards.filter((c) => c.revealed).length}`;

  return (
    <PassGate
      key={gateKey}
      name={player.name}
      note={reveal.reason}
      cta={`I'm ${player.name} — take the hit`}
    >
      {choice}
    </PassGate>
  );
}

// ---------- ambassador ----------

function ExchangePanel({ state, dispatch }: { state: CoupView; dispatch: React.Dispatch<Action> }) {
  const pending = state.pending!;
  const actor = state.players.find((p) => p.id === pending.actorId)!;
  const mine = state.omniscient || state.selfId === actor.id;

  if (!mine) return <Waiting who={actor.name} what="is trading with the court." />;

  const live = known(actor.cards).filter((c) => !c.revealed);
  const pool = [...live, ...known(state.exchangeDraw)];
  const keepCount = live.length;

  const body = (
    <ExchangeChoice pool={pool} keepCount={keepCount} dispatch={dispatch} />
  );

  if (!state.omniscient) return body;

  return (
    <PassGate
      key={actor.id}
      name={actor.name}
      note="Two cards drawn from the court."
      cta={`I'm ${actor.name}`}
    >
      {body}
    </PassGate>
  );
}

function ExchangeChoice({
  pool,
  keepCount,
  dispatch,
}: {
  pool: { id: string; character: Character }[];
  keepCount: number;
  dispatch: React.Dispatch<Action>;
}) {
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= keepCount
          ? prev
          : [...prev, id]
    );

  return (
    <div className="choose">
      <p className="choose-title">
        Keep {keepCount === 1 ? "one" : "two"} of these {pool.length}. The rest go back and get
        shuffled.
      </p>
      <div className="choose-cards">
        {pool.map((card) => (
          <CardFace
            key={card.id}
            character={card.character}
            selected={picked.includes(card.id)}
            onClick={() => toggle(card.id)}
            label={picked.includes(card.id) ? "Keep" : undefined}
            caption
            sizes="(max-width: 520px) 24vw, 110px"
          />
        ))}
      </div>
      <button
        className="btn btn-primary"
        disabled={picked.length !== keepCount}
        onClick={() => dispatch({ type: "EXCHANGE_KEEP", cardIds: picked })}
      >
        {picked.length === keepCount
          ? "Keep these and pass on"
          : `Pick ${keepCount - picked.length} more`}
      </button>
    </div>
  );
}

// ---------- shared bits ----------

function Claim({
  text,
  character,
  note,
}: {
  text: string;
  character: Character | null;
  note: string;
}) {
  return (
    <div
      className={`claim${character ? " has-claim" : ""}`}
      style={character ? { ["--c" as string]: `var(--${character})` } : undefined}
    >
      {character && (
        <span className="claim-glyph" aria-hidden>
          {CHARACTER_INFO[character].glyph}
        </span>
      )}
      <p className="claim-text">{text}</p>
      <span className="chevron" aria-hidden />
      <p className="claim-note">{note}</p>
    </div>
  );
}

function TargetPick({
  title,
  players,
  onPick,
  onCancel,
}: {
  title: string;
  players: PlayerView[];
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="picker">
      <p className="choose-title">{title}</p>
      <div className="pick-grid">
        {players.map((p) => (
          <button className="pick-btn" key={p.id} onClick={() => onPick(p.id)}>
            <span className="pick-name">{p.name}</span>
            <span className="pick-meta">
              {p.coins} coins · {p.cards.filter((c) => !c.revealed).length} left
            </span>
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={onCancel}>
        Back
      </button>
    </div>
  );
}

function BlockPick({
  blockers,
  claims,
  onPick,
  onCancel,
}: {
  blockers: PlayerView[];
  claims: Character[];
  onPick: (blockerId: string, claim: Character) => void;
  onCancel: () => void;
}) {
  const [who, setWho] = useState<string | null>(blockers.length === 1 ? blockers[0].id : null);

  if (!who) {
    return (
      <TargetPick title="Who blocks?" players={blockers} onPick={setWho} onCancel={onCancel} />
    );
  }

  if (claims.length === 1) {
    return (
      <div className="picker">
        <p className="choose-title">Block with the {CHARACTER_INFO[claims[0]].name}?</p>
        <div className="pick-grid">
          <button className="pick-btn" onClick={() => onPick(who, claims[0])}>
            <span className="pick-name">Claim the {CHARACTER_INFO[claims[0]].name}</span>
            <span className="pick-meta">Bluffing is allowed</span>
          </button>
        </div>
        <button className="btn btn-ghost" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="picker">
      <p className="choose-title">Block with which card?</p>
      <div className="pick-grid">
        {claims.map((c) => (
          <button
            className="pick-btn"
            key={c}
            style={{ ["--c" as string]: `var(--${c})` }}
            onClick={() => onPick(who, c)}
          >
            <span className="pick-name">{CHARACTER_INFO[c].name}</span>
            <span className="pick-meta">{CHARACTER_INFO[c].counter}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={onCancel}>
        Back
      </button>
    </div>
  );
}
