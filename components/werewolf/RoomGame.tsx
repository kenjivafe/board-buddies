"use client";

import { useState } from "react";
import RoomShell from "@/components/room/RoomShell";
import type { Action } from "@/lib/werewolf/reducer";
import { MIN_PLAYERS, suggestLineup } from "@/lib/werewolf/roles";
import type { NightStep, Role } from "@/lib/werewolf/types";
import type { OnuwView } from "@/lib/werewolf/view";
import { Sky } from "./Bits";
import Day from "./Day";
import End from "./End";
import { skyFor } from "./Game";
import Lineup from "./Lineup";
import Night from "./Night";
import RoomDeal from "./RoomDeal";
import RoomNarrator from "./RoomNarrator";
import { YouAre } from "./Table";
import { NarratorProvider } from "./useNarrator";

/**
 * One Night across devices. There is nothing to pass and nothing to peek at:
 * the card you were dealt sits on your own screen all game, and the night only
 * ever reaches the people it wakes.
 */
export default function RoomGame({ code }: { code: string }) {
  // the host's box, sized to whoever has actually turned up
  const [lineup, setLineup] = useState<Record<Role, number> | null>(null);
  const [seconds, setSeconds] = useState(300);
  /**
   * The role the narrator has finished calling on *this* device.
   *
   * A room has no phone to pass, so the only thing keeping a player in their
   * turn is being asked for it. Held here rather than inside the night screen
   * because the narrator is a sibling of it, not a parent.
   */
  const [called, setCalled] = useState<NightStep | null>(null);
  /**
   * Whether the night has finished saying goodbye.
   *
   * The phase turns to day the moment the last role acts, but the script still
   * owes the table two lines — the last role to bed, and everybody awake. The
   * cockerel and the argument both used to arrive on top of those. This lags
   * the phase until the narrator has actually got the words out, exactly as
   * the one-phone night does.
   */
  const [dawned, setDawned] = useState(false);

  return (
    /*
     * Above the shell rather than inside it: the mute lives in the room bar
     * now, beside the way out, so the bar and the game have to be looking at
     * the same narrator. Mounted through the lobby too, where it does nothing
     * — no scene is set until the night actually falls.
     */
    <NarratorProvider>
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
      /* the script is read from the bar, so the mute sits where the way out is */
      barExtra={(room, dispatch) => {
        const view = room.state as OnuwView;
        return (
          <RoomNarrator
            view={view}
            dispatch={dispatch as React.Dispatch<Action>}
            paces={room.isHost}
            onCalled={setCalled}
            dawning={(view.phase === "day" || view.phase === "vote") && !dawned}
            onDawned={() => setDawned(true)}
            onNight={() => setDawned(false)}
          />
        );
      }}
    >
      {(room, dispatch) => {
        const view = room.state as OnuwView;
        const send = dispatch as React.Dispatch<Action>;
        const dawning = (view.phase === "day" || view.phase === "vote") && !dawned;

        return (
          <>
            <Sky time={skyFor(view)} />
            {/*
              Listed rather than defaulted. `day` used to be the else-branch,
              so a room that ended up anywhere unexpected — a deal that had not
              been walked through, say — quietly rendered the argument and
              offered a vote that the reducer then refused.
            */}
            {view.phase === "ended" ? (
              <End view={view} dispatch={send} canControl={room.isHost} />
            ) : view.phase === "deal" ? (
              <RoomDeal view={view} dispatch={send} canControl={room.isHost} />
            ) : (view.phase === "day" || view.phase === "vote") && !dawning ? (
              <>
                <Day view={view} dispatch={send} canControl={room.isHost} />
                <YouAre view={view} />
              </>
            ) : (
              /* the night, and the tail of it: while `dawning` this is still
                 the dark, because the moderator has not finished speaking */
              <>
                <Night view={view} dispatch={send} called={called} />
                <YouAre view={view} />
              </>
            )}
          </>
        );
      }}
    </RoomShell>
    </NarratorProvider>
  );
}
