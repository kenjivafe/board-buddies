"use client";

import { useState } from "react";
import Link from "next/link";
import { CHARACTER_INFO, CHARACTERS } from "@/lib/coup/deck";
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

      <header className="coup-hero">
        <span className="crest" aria-hidden>
          {CHARACTERS.map((c) => (
            <span key={c} style={{ ["--c" as string]: `var(--${c})` }}>
              {CHARACTER_INFO[c].glyph}
            </span>
          ))}
        </span>
        <h1 className="title">
          Cou<em>p</em>
        </h1>
        <span className="chevron" aria-hidden />
        <p className="coup-sub">
          Two influences each. Lie about both. Last one standing runs the court.
        </p>
      </header>

      <ModePicker
        game="coup"
        onOnePhone={() => setOnePhone(true)}
        blurb={{
          one: "Pass it around. Hands stay hidden behind a gate you hold to peek through.",
          many: "Everyone scans a QR and holds their own hand. No passing, nothing to peek at.",
        }}
      />
    </main>
  );
}
