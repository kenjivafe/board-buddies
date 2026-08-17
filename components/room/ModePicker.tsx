"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameId } from "@/lib/room/types";
import { createRoom } from "./useRoom";
import { normalise } from "./code";

/**
 * The fork every game opens on: share one phone, or give everyone their own.
 * Falls back to one-phone only when there is no Redis configured behind rooms.
 */
export default function ModePicker({
  game,
  onOnePhone,
  blurb,
}: {
  game: GameId;
  onOnePhone: () => void;
  blurb: { one: string; many: string };
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState<boolean | null>(null);
  const [step, setStep] = useState<"pick" | "host" | "join">("pick");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rooms", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setRooms(Boolean(d.configured)))
      .catch(() => setRooms(false));
  }, []);

  const host = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(game, name.trim());
      router.push(`/${game}/room/${room.code}`);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not open a room.");
      setBusy(false);
    }
  };

  if (step === "host") {
    return (
      <section className="mode-step">
        <span className="eyebrow">Your name</span>
        <div className="field-row">
          <input
            className="text-input"
            placeholder="Your name"
            value={name}
            maxLength={18}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && host()}
            aria-label="Your name"
            autoFocus
          />
        </div>
        {error && <p className="room-error">{error}</p>}
        <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={host}>
          {busy ? "Opening the room…" : "Open the room"}
        </button>
        <button className="btn btn-ghost" onClick={() => setStep("pick")}>
          Back
        </button>
        <p className="hint">You&apos;ll get a code and a QR for everyone else to scan.</p>
      </section>
    );
  }

  if (step === "join") {
    const ready = normalise(code).length === 4;
    return (
      <section className="mode-step">
        <span className="eyebrow">Room code</span>
        <div className="field-row">
          <input
            className="text-input code-input"
            placeholder="ABCD"
            value={code}
            maxLength={4}
            onChange={(e) => setCode(normalise(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && ready && router.push(`/${game}/room/${normalise(code)}`)}
            aria-label="Room code"
            autoFocus
          />
        </div>
        <button
          className="btn btn-primary"
          disabled={!ready}
          onClick={() => router.push(`/${game}/room/${normalise(code)}`)}
        >
          Find the room
        </button>
        <button className="btn btn-ghost" onClick={() => setStep("pick")}>
          Back
        </button>
      </section>
    );
  }

  return (
    <section className="mode-pick" aria-label="How are you playing?">
      <span className="eyebrow">How are you playing?</span>

      <button className="mode-card" onClick={onOnePhone}>
        <span className="mode-title">One phone</span>
        <span className="mode-blurb">{blurb.one}</span>
      </button>

      <button
        className="mode-card"
        disabled={rooms === false}
        onClick={() => setStep("host")}
      >
        <span className="mode-title">Our own devices</span>
        <span className="mode-blurb">
          {rooms === false
            ? "Needs a Redis connection — see the README to switch this on."
            : blurb.many}
        </span>
      </button>

      {rooms !== false && (
        <button className="btn btn-ghost" onClick={() => setStep("join")}>
          I have a room code
        </button>
      )}
    </section>
  );
}
