"use client";

import { useState } from "react";
import Link from "next/link";
import type { GameId, RoomView } from "@/lib/room/types";
import Lobby from "./Lobby";
import { joinRoom, useRoom } from "./useRoom";

/**
 * Everything a room needs before the game itself: connecting, taking a seat,
 * waiting in the lobby. Hands off to `children` once play is under way.
 */
export default function RoomShell({
  code,
  game,
  minSeats,
  lobbyExtra,
  startOptions,
  children,
}: {
  code: string;
  game: GameId;
  minSeats: number;
  /** host-only pre-game controls. Given the room, because most such controls
      (Werewolf's lineup, say) have to size themselves to who has turned up. */
  lobbyExtra?: (room: RoomView) => React.ReactNode;
  /** read when the host actually presses start, so it can follow those controls */
  startOptions?: (room: RoomView) => Record<string, unknown>;
  children: (room: RoomView, dispatch: (action: unknown) => void) => React.ReactNode;
}) {
  const { room, status, error, seated, dispatch, start, leave } = useRoom(code);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const takeSeat = async () => {
    if (!name.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      await joinRoom(code, name.trim());
      // the hook picks the seat up from localStorage on remount
      window.location.reload();
    } catch (thrown) {
      setJoinError(thrown instanceof Error ? thrown.message : "Could not join.");
      setJoining(false);
    }
  };

  const back = (
    <Link className="back-link" href={`/${game}`}>
      <span aria-hidden>←</span> Leave
    </Link>
  );

  if (status === "gone") {
    return (
      <main className="shell">
        {back}
        <section className="gate">
          <span className="eyebrow">Room {code}</span>
          <h2 className="gate-name">Closed</h2>
          <p className="gate-note">{error ?? "That room has expired."}</p>
          <Link className="btn btn-primary" href={`/${game}`}>
            Start a new one
          </Link>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="shell">
        {back}
        <section className="gate">
          <span className="eyebrow">Room {code}</span>
          <h2 className="gate-name">Connecting</h2>
          {error && <p className="room-error">{error}</p>}
        </section>
      </main>
    );
  }

  // no seat on this device yet — this is the scanned-the-QR path
  if (!seated || !room.selfId) {
    const full = room.phase !== "lobby";
    return (
      <main className="shell">
        {back}
        <section className="gate">
          <span className="eyebrow">Joining room</span>
          <h2 className="gate-name">{room.code}</h2>
          {full ? (
            <p className="gate-note">
              This game has already started. Ask the host to finish and deal again.
            </p>
          ) : (
            <>
              <p className="gate-note">
                {room.seats.length} already here: {room.seats.map((s) => s.name).join(", ")}
              </p>
              <div className="field-row">
                <input
                  className="text-input"
                  placeholder="Your name"
                  value={name}
                  maxLength={18}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && takeSeat()}
                  aria-label="Your name"
                />
              </div>
              {joinError && <p className="room-error">{joinError}</p>}
              <button
                className="btn btn-primary"
                disabled={!name.trim() || joining}
                onClick={takeSeat}
              >
                {joining ? "Taking a seat…" : "Take a seat"}
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (room.phase === "lobby" || room.state == null) {
    return (
      <main className="shell">
        {back}
        <Lobby
          room={room}
          minSeats={minSeats}
          error={error}
          extra={lobbyExtra?.(room)}
          onStart={() => void start(startOptions?.(room)).catch(() => {})}
          onLeave={() => {
            void leave().finally(() => {
              window.location.href = `/${game}`;
            });
          }}
        />
      </main>
    );
  }

  // Mid-game there was previously no way out at all, which also left an
  // abandoned game trapping everyone still in it.
  if (leaving) {
    return (
      <main className="shell">
        <section className="gate">
          <span className="eyebrow">Room {room.code}</span>
          <h2 className="gate-name">Leave?</h2>
          <p className="gate-note">
            Your seat is kept. Come back any time with the code <strong>{room.code}</strong>.
          </p>
          <button className="btn btn-primary" onClick={() => setLeaving(false)}>
            Stay in the game
          </button>
          <Link className="btn btn-ghost" href={`/${game}`}>
            Back to the games
          </Link>
          {room.isHost && (
            <>
              <button
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: "NEW_GAME" });
                  setLeaving(false);
                }}
              >
                End the game for everyone
              </button>
              <p className="hint">
                Ends this round and returns the whole room to the lobby, seats intact.
              </p>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <RoomBar room={room} status={status} error={error} onLeave={() => setLeaving(true)} />
      {children(room, dispatch)}
    </main>
  );
}

function RoomBar({
  room,
  status,
  error,
  onLeave,
}: {
  room: RoomView;
  status: string;
  error: string | null;
  onLeave: () => void;
}) {
  return (
    <div className="room-bar">
      <span className="room-bar-code">
        Room {room.code}
        <span className={`live-dot${status === "live" ? " on" : ""}`} aria-hidden />
      </span>
      <span className="room-bar-you">
        You are {room.seats.find((s) => s.id === room.selfId)?.name}
      </span>
      <button className="room-bar-leave" onClick={onLeave}>
        Leave
      </button>
      {error && <span className="room-bar-error">{error}</span>}
    </div>
  );
}
