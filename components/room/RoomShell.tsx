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
  /** host-only pre-game controls */
  lobbyExtra?: React.ReactNode;
  startOptions?: Record<string, unknown>;
  children: (room: RoomView, dispatch: (action: unknown) => void) => React.ReactNode;
}) {
  const { room, status, error, seated, dispatch, start, leave } = useRoom(code);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
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
          extra={lobbyExtra}
          onStart={() => void start(startOptions).catch(() => {})}
          onLeave={() => {
            void leave().finally(() => {
              window.location.href = `/${game}`;
            });
          }}
        />
      </main>
    );
  }

  return (
    <main className="shell">
      <RoomBar room={room} status={status} error={error} />
      {children(room, dispatch)}
    </main>
  );
}

function RoomBar({
  room,
  status,
  error,
}: {
  room: RoomView;
  status: string;
  error: string | null;
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
      {error && <span className="room-bar-error">{error}</span>}
    </div>
  );
}
