"use client";

import type { Action } from "@/lib/coup/reducer";
import type { CoupView } from "@/lib/coup/view";
import { known } from "@/lib/coup/view";
import RoomShell from "@/components/room/RoomShell";
import { CardFace } from "./Cards";
import End from "./End";
import Play from "./Play";
import { useVoice } from "./useVoice";

/** Coup across devices: your hand is yours, and nobody passes anything. */
export default function RoomGame({ code }: { code: string }) {
  return (
    <RoomShell code={code} game="coup" minSeats={2}>
      {(room, dispatch) => (
        <CoupRoom view={room.state as CoupView} dispatch={dispatch as React.Dispatch<Action>} />
      )}
    </RoomShell>
  );
}

/**
 * Sits between the room and the phase switch so the voice hook outlives the
 * end of the game — otherwise the final influence never gets to speak.
 */
function CoupRoom({
  view,
  dispatch,
}: {
  view: CoupView;
  dispatch: React.Dispatch<Action>;
}) {
  const voice = useVoice(view.cues);

  if (view.phase === "ended") return <End state={view} dispatch={dispatch} />;

  return (
    <>
      <Play state={view} dispatch={dispatch} voice={voice} />
      <MyHand view={view} />
    </>
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
