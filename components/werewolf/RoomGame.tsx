"use client";

import { useState } from "react";
import RoomShell from "@/components/room/RoomShell";
import type { Action } from "@/lib/werewolf/reducer";
import { MIN_PLAYERS, suggestLineup } from "@/lib/werewolf/roles";
import type { Role } from "@/lib/werewolf/types";
import type { OnuwView } from "@/lib/werewolf/view";
import { Sky } from "./Bits";
import Day from "./Day";
import End from "./End";
import { skyFor } from "./Game";
import Lineup from "./Lineup";
import Night from "./Night";
import { YouAre } from "./Table";

/**
 * One Night across devices. There is nothing to pass and nothing to peek at:
 * the card you were dealt sits on your own screen all game, and the night only
 * ever reaches the people it wakes.
 */
export default function RoomGame({ code }: { code: string }) {
  // the host's box, sized to whoever has actually turned up
  const [lineup, setLineup] = useState<Record<Role, number> | null>(null);
  const [seconds, setSeconds] = useState(300);

  return (
    <RoomShell
      code={code}
      game="werewolf"
      minSeats={MIN_PLAYERS}
      lobbyExtra={(room) => (
        <section style={{ width: "100%", textAlign: "left" }} aria-label="The box">
          <span className="eyebrow">What goes in the box</span>
          <Lineup
            players={room.seats.length}
            lineup={lineup ?? suggestLineup(room.seats.length)}
            onChange={setLineup}
            seconds={seconds}
            onSeconds={setSeconds}
          />
        </section>
      )}
      startOptions={(room) => ({
        lineup: lineup ?? suggestLineup(room.seats.length),
        discussionSeconds: seconds,
      })}
    >
      {(room, dispatch) => {
        const view = room.state as OnuwView;
        const send = dispatch as React.Dispatch<Action>;

        return (
          <>
            <Sky time={skyFor(view)} />
            {view.phase === "ended" ? (
              <End view={view} dispatch={send} canControl={room.isHost} />
            ) : view.phase === "night" ? (
              <>
                <Night view={view} dispatch={send} />
                <YouAre view={view} />
              </>
            ) : (
              <>
                <Day view={view} dispatch={send} canControl={room.isHost} />
                <YouAre view={view} />
              </>
            )}
          </>
        );
      }}
    </RoomShell>
  );
}
