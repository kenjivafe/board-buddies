"use client";

import { useEffect, useState } from "react";
import type { Action } from "@/lib/werewolf/reducer";
import { playerIn, type OnuwView } from "@/lib/werewolf/view";
import { Moon, Rule, Waiting } from "./Bits";
import { DAWN, shown } from "@/lib/werewolf/narration";
import { Board, Notebook, PickNames } from "./Table";
import { MuteButton } from "./useNarrator";

type Props = {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
  /** whoever calls time on the argument: the phone holder, or the room's host */
  canControl: boolean;
};

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Daylight. One argument, then everybody points at once, and that is the game.
 * The clock is display only — it never fires anything, because deciding the
 * table has argued enough is a person's job.
 */
export default function Day({ view, dispatch, canControl }: Props) {
  return (
    <>
      <header className="night-head">
        <Moon size={40} phase={0} className="sun" />
        <span className="night-title">
          <span className="eyebrow">Morning</span>
          <strong>{view.phase === "vote" ? "Everybody points" : "Talk it out"}</strong>
        </span>
      </header>

      {view.phase === "vote" ? (
        <Ballot view={view} dispatch={dispatch} />
      ) : (
        <Argument view={view} dispatch={dispatch} canControl={canControl} />
      )}

      <Notebook notes={view.self?.notes ?? []} label="Your notebook" />
      {/* The ballot is already a list of everybody at the table, and it says
          how far the vote has got — a second roster underneath it was the same
          names twice. */}
      {view.phase !== "vote" && <Board view={view} />}
    </>
  );
}

function Clock({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = endsAt - now;

  return (
    <div className={`clock${left <= 0 ? " out" : ""}`}>
      <span className="clock-time">{mmss(left)}</span>
      <span className="eyebrow">{left <= 0 ? "Time's up" : "Left to argue"}</span>
    </div>
  );
}

function Argument({ view, dispatch, canControl }: Props) {
  // "Everyone, wake up" is said by the night's closing beat, on its way out —
  // the line is only printed here, as the header of the day it opened
  return (
    <section className="ww-section">
      {view.omniscient && (
        <>
          <MuteButton />
          <p className="beat-call dawn-call">{shown(DAWN)}</p>
        </>
      )}
      <p className="ww-sub" style={{ maxWidth: "none" }}>
        Everybody claims a role. Somebody is lying, somebody is wrong about themselves, and at
        least three cards nobody has ever seen are sitting in the middle.
      </p>

      {/*
        The clock and the reason there is no button beside it, rather than
        stacked. They are one thought — how long is left, and what to do while
        it runs — and as two boxed panels in a column they pushed the roster
        and the notebook off the bottom of the screen between them.

        The host is the exception and keeps the button on its own line: it is
        the only thing on this screen anybody presses, and pairing it with a
        readout would demote it.
      */}
      {(view.dayEndsAt !== null || !canControl) && (
        <div className="day-status">
          {view.dayEndsAt !== null && <Clock endsAt={view.dayEndsAt} />}
          {!canControl && <Waiting text="Keep arguing." on="The host calls the vote." />}
        </div>
      )}

      {canControl && (
        <button className="btn btn-primary day-call" onClick={() => dispatch({ type: "OPEN_VOTE" })}>
          Three, two, one — point
        </button>
      )}
    </section>
  );
}

/**
 * Everyone points at once. On one phone the pointing happened out loud, so the
 * table's fingers are entered one at a time; on separate devices it is a real
 * secret ballot that opens all at once.
 */
function Ballot({ view, dispatch }: Omit<Props, "canControl">) {
  const cast = Object.keys(view.votedIds);

  if (view.omniscient) {
    // whoever hasn't been recorded yet, in seat order
    const next = view.players.find((p) => !view.votedIds.includes(p.id));
    if (!next) return null;
    return (
      <section className="ww-section">
        <Rule>{`${view.votedIds.length + 1} of ${view.players.length}`}</Rule>
        <p className="ww-sub">
          On three, everybody points. Then tap round the table and record who each person went
          for.
        </p>
        <div className="reading">
          <span className="eyebrow">Who did they point at?</span>
          <span className="reading-verdict">{next.name}</span>
        </div>
        <PickNames
          people={view.players.filter((p) => p.id !== next.id)}
          selected={[]}
          onPick={(targetId) => dispatch({ type: "VOTE", voterId: next.id, targetId })}
          label={`Who ${next.name} pointed at`}
        />
      </section>
    );
  }

  const me = view.selfId;
  if (!me) return null;
  const left = view.players.filter((p) => !view.votedIds.includes(p.id));

  if (view.myVote !== undefined) {
    return (
      <section className="ww-section">
        <Rule>Your finger is up</Rule>
        <div className="reading">
          <span className="eyebrow">You pointed at</span>
          <span className="reading-verdict">{playerIn(view, view.myVote)?.name}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Waiting
            text="Waiting on the rest of the table."
            on={`Still to point: ${left.map((p) => p.name).join(", ")}`}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="ww-section">
      {/* No preamble. By the time the ballot is open the table has argued for
          five minutes and knows perfectly well what pointing does; the rules
          of it were only ever in the way of the one thing to do here. */}
      <Rule>Point at somebody</Rule>
      <PickNames
        people={view.players.filter((p) => p.id !== me)}
        selected={[]}
        onPick={(targetId) => dispatch({ type: "VOTE", voterId: me, targetId })}
        label="Who to point at"
      />
      <p className="hint" style={{ marginTop: 10 }}>
        {cast.length} of {view.players.length} have pointed.
      </p>
    </section>
  );
}
