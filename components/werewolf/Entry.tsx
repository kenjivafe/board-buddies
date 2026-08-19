"use client";

import { useState } from "react";
import Link from "next/link";
import ModePicker from "@/components/room/ModePicker";
import { CENTRE, ROLES, ROLE_INFO } from "@/lib/werewolf/roles";
import { CardFace, Moon, Rule, Sky, tint } from "./Bits";
import Game from "./Game";

/** The front door: pick how you're playing, then hand off. */
export default function Entry() {
  const [onePhone, setOnePhone] = useState(false);

  if (onePhone) return <Game />;

  return (
    <main className="shell">
      <Sky time="night" />
      <Link className="back-link" href="/">
        <span aria-hidden>←</span> Board Buddies
      </Link>

      <header className="ww-hero">
        <Moon size={70} phase={0} />
        <span className="ww-kicker">One Night</span>
        <h1 className="title">
          Were<em>wolf</em>
        </h1>
        <p className="ww-sub">
          One night, one argument, one vote, and that&apos;s the whole game. Nobody is
          eliminated — but the card you were dealt may not be the card you&apos;re holding by
          morning.
        </p>
      </header>

      <ModePicker
        game="werewolf"
        onOnePhone={() => setOnePhone(true)}
        blurb={{
          one: "Pass it around. The app is the moderator — it wakes each role behind a gate, then calls the vote.",
          many: "Everyone scans a QR. The night reaches only the people it wakes, and the vote is a real sealed ballot.",
        }}
      />

      <section className="ww-section" aria-label="How it works">
        <Rule>How it works</Rule>
        <p className="ww-sub" style={{ maxWidth: "none", textAlign: "left" }}>
          Everybody gets one card and {CENTRE} more go face down in the middle. Roles wake in
          order and do one thing each — some of them move cards around, so by the end you may be
          arguing for a role you no longer have. Then everybody points at once. Kill a werewolf
          and the village wins; kill nobody while one is loose and the pack does.
        </p>
      </section>

      <section className="ww-section" aria-label="The cards">
        <Rule>What&apos;s in the box</Rule>
        <ul className="key-list">
          {ROLES.map((role) => {
            const info = ROLE_INFO[role];
            return (
              <li className="key-row" key={role} style={{ ["--c" as string]: tint(role) }}>
                <CardFace role={role} size="xs" />
                <span className="key-body">
                  <span className="key-name">
                    {info.name}
                    {info.copies > 1 && <span className="key-count"> · ×{info.copies}</span>}
                  </span>
                  <span className="key-blurb">{info.blurb}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="hint" style={{ marginTop: 12 }}>
          The host picks which of these go in. The Masons only ever go in as a pair.
        </p>
      </section>
    </main>
  );
}
