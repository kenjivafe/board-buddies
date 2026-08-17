"use client";

import type { Action } from "@/lib/coup/reducer";
import type { CoupView } from "@/lib/coup/view";
import { known } from "@/lib/coup/view";
import RoomShell from "@/components/room/RoomShell";
import { CardFace } from "./Cards";
import End from "./End";
import Play from "./Play";

/** Coup across devices: your hand is yours, and nobody passes anything. */
export default function RoomGame({ code }: { code: string }) {
  return (
    <RoomShell code={code} game="coup" minSeats={2}>
      {(room, dispatch) => {
        const view = room.state as CoupView;
        const send = dispatch as React.Dispatch<Action>;

        if (view.phase === "ended") return <End state={view} dispatch={send} />;

        return (
          <>
            <Play state={view} dispatch={send} />
            <MyHand view={view} />
          </>
        );
      }}
    </RoomShell>
  );
}

/**
 * On your own device there is nothing to hide from yourself, so your hand sits
 * at the bottom of the screen for the whole game.
 */
function MyHand({ view }: { view: CoupView }) {
  const me = view.players.find((p) => p.id === view.selfId);
  if (!me) return null;
  const cards = known(me.cards);
  if (cards.length === 0) return null;

  return (
    <section className="my-hand" aria-label="Your influences">
      <span className="eyebrow">Your hand · keep it to yourself</span>
      <div className="choose-cards">
        {cards.map((card) => (
          <CardFace
            key={card.id}
            character={card.character}
            spent={card.revealed}
            caption
            sizes="(max-width: 520px) 34vw, 150px"
          />
        ))}
      </div>
    </section>
  );
}
