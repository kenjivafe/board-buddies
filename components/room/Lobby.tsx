"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/room/types";
import Qr from "./Qr";

/**
 * The waiting room. The host sees the QR and the start button; everyone else
 * sees who has arrived.
 */
export default function Lobby({
  room,
  minSeats,
  onStart,
  onLeave,
  extra,
  error,
}: {
  room: RoomView;
  minSeats: number;
  onStart: () => void;
  onLeave: () => void;
  /** game-specific pre-game options, host only */
  extra?: React.ReactNode;
  error?: string | null;
}) {
  const [joinUrl, setJoinUrl] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // the invite has to be the address friends can actually reach, which only
  // the browser knows
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${room.code}`);
  }, [room.code]);

  const copy = async (what: "code" | "link", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
  };

  const enough = room.seats.length >= minSeats;

  return (
    <section className="lobby" aria-label="Room lobby">
      <span className="eyebrow">Room code</span>
      <button
        className="room-code"
        onClick={() => copy("code", room.code)}
        aria-label={`Room code ${room.code.split("").join(" ")}. Tap to copy.`}
      >
        {room.code}
      </button>

      {joinUrl && (
        <>
          <Qr url={joinUrl} label={`Scan to join room ${room.code}`} />
          <button className="btn btn-ghost" onClick={() => copy("link", joinUrl)}>
            {copied === "link" ? "Link copied" : "Copy invite link"}
          </button>
        </>
      )}
      {copied === "code" && <p className="hint">Code copied.</p>}

      <div className="lobby-seats">
        <span className="eyebrow">
          In the room · {room.seats.length}
        </span>
        <ul className="seat-list">
          {room.seats.map((seat) => (
            <li className={`seat-row${seat.id === room.selfId ? " you" : ""}`} key={seat.id}>
              <span className="seat-name">{seat.name}</span>
              {seat.isHost && <span className="seat-tag">Host</span>}
              {seat.id === room.selfId && <span className="seat-tag you-tag">You</span>}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="room-error">{error}</p>}

      {room.isHost ? (
        <div className="lobby-actions">
          {extra}
          <button className="btn btn-primary" disabled={!enough} onClick={onStart}>
            {enough ? "Start the game" : `Waiting for ${minSeats - room.seats.length} more`}
          </button>
        </div>
      ) : (
        <p className="hint">Waiting for the host to start.</p>
      )}

      <button className="btn btn-ghost lobby-leave" onClick={onLeave}>
        Leave room
      </button>
    </section>
  );
}
