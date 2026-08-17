"use client";

import type { Action } from "@/lib/kings-cup/reducer";
import type { KcView } from "@/lib/kings-cup/view";
import RoomShell from "@/components/room/RoomShell";
import End from "./End";
import Play from "./Play";

/**
 * King's Cup across devices. Nothing in this game is secret, so every screen
 * shows the same thing — the difference is that only the player whose turn it
 * is can draw, and only the drawer resolves their own card.
 */
export default function RoomGame({ code }: { code: string }) {
  return (
    <RoomShell code={code} game="kings-cup" minSeats={2}>
      {(room, dispatch) => {
        const view = room.state as KcView;
        const send = dispatch as React.Dispatch<Action>;

        if (view.phase === "ended") return <End state={view} dispatch={send} />;
        return (
          <Play
            state={view}
            dispatch={send}
            selfId={room.selfId}
            canUndo={room.isHost}
          />
        );
      }}
    </RoomShell>
  );
}
