"use client";

import type { Action } from "@/lib/werewolf/reducer";
import type { OnuwView } from "@/lib/werewolf/view";
import { CardFace, RoleBrief, Rule, Waiting } from "./Bits";

/**
 * The deal, on separate devices.
 *
 * Rooms used to skip this outright: a card that sits on its owner's own screen
 * all game does not need handing round, so there seemed to be nothing to do.
 * But the round was never really about passing the phone — it is the minute
 * where everybody reads what they were dealt and works out what it means to
 * them before the dark, and the night landing the instant the host pressed
 * start took that away from a room.
 *
 * So the same beat, without the queue. Everyone looks at once, the table can
 * see who it is still waiting on, and the night falls when the last of them
 * says they are ready. Nothing here is gated behind a thumb, because there is
 * nobody else looking at this screen.
 */
export default function RoomDeal({
  view,
  dispatch,
  canControl,
}: {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
  /** the host, who can start without whoever has wandered off */
  canControl: boolean;
}) {
  const self = view.self;
  const me = view.selfId;
  const ready = me ? view.dealSeen.includes(me) : false;
  const waitingOn = view.players.filter((p) => !view.dealSeen.includes(p.id));

  // a spectator, or a seat the deal does not know about
  if (!self) {
    return (
      <section className="gate">
        <span className="eyebrow">The cards are out</span>
        <Waiting text="Waiting for the table to look at their cards" />
      </section>
    );
  }

  return (
    <section className="gate">
      <span className="eyebrow">Your card</span>
      <CardFace role={self.dealt} size="lg" />
      <RoleBrief role={self.dealt} />
      <Rule />

      {ready ? (
        <>
          <Waiting
            text="Waiting for the rest of the table"
            on={waitingOn.map((p) => p.name).join(", ")}
          />
          <p className="hint">
            {waitingOn.length === 0
              ? "That's everybody. Night is falling."
              : `${view.dealSeen.length} of ${view.players.length} have looked.`}
          </p>
        </>
      ) : (
        <>
          <button
            className="btn btn-primary"
            onClick={() => me && dispatch({ type: "SAW_DEAL", playerId: me })}
          >
            Got it — I'm ready
          </button>
          <p className="hint">
            Remember it. Somebody may well take it off you before morning, and what
            you hold at the end is what you win with.
          </p>
        </>
      )}

      {canControl && waitingOn.length > 0 && (
        <button className="btn btn-ghost" onClick={() => dispatch({ type: "BEGIN_NIGHT" })}>
          Start without them
        </button>
      )}
    </section>
  );
}
