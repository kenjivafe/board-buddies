"use client";

import type { Action } from "@/lib/werewolf/reducer";
import type { OnuwView } from "@/lib/werewolf/view";
import { PassGate, PeekCard, RoleBrief, Rule } from "./Bits";

/**
 * One phone, one card at a time. Nothing about a player renders until they say
 * they are holding the phone, and even then only while their thumb is down.
 */
export default function Deal({
  view,
  dispatch,
}: {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
}) {
  const player = view.players[view.dealIndex];
  if (!player || !player.dealt) return null;
  const last = view.dealIndex === view.players.length - 1;

  return (
    <PassGate
      key={player.id}
      name={player.name}
      note={`Card ${view.dealIndex + 1} of ${view.players.length}. Hold it to read it, then hand the phone on.`}
    >
      <section className="gate">
        <span className="eyebrow">Your card, {player.name}</span>
        <PeekCard role={player.dealt} />
        <RoleBrief role={player.dealt} />
        <Rule />
        <button className="btn btn-primary" onClick={() => dispatch({ type: "DEAL_NEXT" })}>
          {last ? "Everyone's seen it — night falls" : "Done, pass it on"}
        </button>
        <p className="hint">
          Remember it. Somebody may well take it off you before morning.
        </p>
      </section>
    </PassGate>
  );
}
