import Link from "next/link";
import { GAMES } from "@/lib/games";

const SEATS = [0, 1, 2, 3, 4, 5, 6, 7];

export default function Hub() {
  return (
    <main className="shell">
      <header className="hub-hero">
        <div className="table">
          <div className="seats" aria-hidden>
            {SEATS.map((i) => (
              <span key={i} style={{ ["--i" as string]: i }} />
            ))}
          </div>
          <h1 className="wordmark">
            Board
            <em>Buddies</em>
          </h1>
        </div>
        <p className="hub-sub">Party games for one phone and a full table. Pick one, pass it around.</p>
      </header>

      <section aria-label="Games">
        <h2 className="eyebrow hub-heading">Games</h2>
        <ul className="game-list">
          {GAMES.map((game) => (
            <li key={game.slug}>
              <Link
                className="game-card"
                href={`/${game.slug}`}
                style={{ ["--accent" as string]: game.accent }}
              >
                <span className="game-emblem" aria-hidden>
                  {game.emblem}
                </span>
                <span className="game-body">
                  <span className="game-name">{game.name}</span>
                  <span className="game-tagline">{game.tagline}</span>
                  <span className="game-meta">{game.players}</span>
                </span>
                <span className="game-go" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="hub-foot">
        <p className="hint">More games are on the way.</p>
      </footer>
    </main>
  );
}
