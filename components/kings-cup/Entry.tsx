"use client";

import { useState } from "react";
import Link from "next/link";
import ModePicker from "@/components/room/ModePicker";
import Game from "./Game";

/** The front door: pick how you're playing, then hand off. */
export default function Entry() {
  const [onePhone, setOnePhone] = useState(false);

  if (onePhone) return <Game />;

  return (
    <main className="shell">
      <Link className="back-link" href="/">
        <span aria-hidden>←</span> Board Buddies
      </Link>

      <header className="setup-hero">
        <span className="crown" aria-hidden>
          {"♔"}
        </span>
        <h1 className="title">
          King&apos;s <em>Cup</em>
        </h1>
        <p className="setup-sub">The drinking card game, minus the bookkeeping.</p>
      </header>

      <ModePicker
        game="kings-cup"
        onOnePhone={() => setOnePhone(true)}
        blurb={{
          one: "One phone goes round the table. Everything is on the one screen.",
          many: "Everyone scans a QR and follows along on their own screen.",
        }}
      />
    </main>
  );
}
