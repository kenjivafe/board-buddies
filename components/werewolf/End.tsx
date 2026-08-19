"use client";

import Link from "next/link";
import type { Action } from "@/lib/werewolf/reducer";
import { ROLE_INFO } from "@/lib/werewolf/roles";
import type { Role, Team } from "@/lib/werewolf/types";
import { centreSlotsIn, playerIn, type OnuwView, type PlayerView } from "@/lib/werewolf/view";
import { CardFace, CardSlot, Moon, Rule, tint } from "./Bits";
import { Notebook } from "./Table";

const BANNER: Record<Team, string> = {
  village: "The village",
  werewolf: "The pack",
  tanner: "The Tanner",
};

/** The order sides are read out in, once the winners have been lifted to the top. */
const TEAMS: Team[] = ["werewolf", "village", "tanner"];

/**
 * The reveal, in the order the table wants it: who won, what everybody
 * actually was, what was in the middle, and only then the count — which is
 * evidence for the argument afterwards rather than the headline.
 *
 * The cards are the point of the screen, so they are cards: laid out three to
 * a line at the size the middle is shown at, with the name underneath, rather
 * than a list of rows with thumbnails in.
 */
export default function End({
  view,
  dispatch,
  canControl,
}: {
  view: OnuwView;
  dispatch: React.Dispatch<Action>;
  canControl: boolean;
}) {
  const outcome = view.outcome;
  if (!outcome) return null;

  const teams = outcome.teams;
  const banner = teams.length === 0 ? "Nobody" : teams.map((t) => BANNER[t]).join(" and ");
  const skin = teams.length === 0 ? "nobody" : teams[0];
  const killed = (id: string) => outcome.killed.includes(id);

  const votersFor = (id: string) =>
    (view.ballots ?? [])
      .filter((b) => b.targetId === id)
      .map((b) => playerIn(view, b.voterId)?.name)
      .filter(Boolean)
      .join(", ");

  /**
   * Everybody, by the side they ended up on — which is the card in their hand
   * at the end, not the one they were dealt. Within the pack the werewolves
   * come before the Minion, so a lone wolf and their Minion sit side by side
   * and a full pack takes the row to itself.
   */
  const sideOf = (p: PlayerView): Team | null =>
    p.final ? ROLE_INFO[p.final].team : null;

  const rank = (p: PlayerView) => (p.final === "werewolf" ? 0 : p.final === "minion" ? 1 : 2);

  const sides = TEAMS
    // whoever won is read out first
    .slice()
    .sort((a, b) => Number(teams.includes(b)) - Number(teams.includes(a)))
    .map((team) => ({
      team,
      won: teams.includes(team),
      members: view.players.filter((p) => sideOf(p) === team).sort((a, b) => rank(a) - rank(b)),
    }))
    .filter((s) => s.members.length > 0);

  return (
    <>
      <header className={`verdict ${skin}`}>
        <Moon size={54} phase={teams.includes("werewolf") ? 0 : 0.4} />
        <span className="eyebrow">
          {outcome.killed.length === 0 ? "Nobody died" : `${outcome.killed.length} dead`}
        </span>
        <h1 className="verdict-team">{banner}</h1>
        <p className="ww-sub">{outcome.reason}</p>
      </header>

      {sides.map(({ team, won, members }) => (
        <section
          className={`side${won ? " won" : ""}`}
          key={team}
          style={{ ["--c" as string]: `var(--team-${team})` }}
          aria-label={BANNER[team]}
        >
          <Rule>
            {BANNER[team]}
            {won ? " · won" : ""}
          </Rule>
          <div className="hand-row">
            {members.map((p) => (
              <Hand
                key={p.id}
                player={p}
                killed={killed(p.id)}
                shot={outcome.hunterShot === p.id}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="ww-section" aria-label="The three in the middle">
        <Rule>The middle, all along</Rule>
        <div className="card-row trio">
          {centreSlotsIn(view).map((slot, i) => (
            <CardSlot
              key={slot}
              role={view.centre[i]}
              caption={["First", "Second", "Third"][i]}
              size="md"
            />
          ))}
        </div>
      </section>

      <section className="ww-section" aria-label="The vote">
        <Rule>The vote</Rule>
        <ul className="tally">
          {outcome.tally.map((row) => (
            <li className={`tally-row${killed(row.id) ? " killed" : ""}`} key={row.id}>
              <span>{playerIn(view, row.id)?.name}</span>
              <span className="tally-count">{row.count}</span>
              {view.ballots && <span className="tally-voters">{votersFor(row.id)}</span>}
            </li>
          ))}
          {outcome.princeSaved.length > 0 && (
            <li className="tally-row">
              <span>Thrown out — cast at the Prince</span>
              <span className="tally-count">{outcome.princeSaved.length}</span>
            </li>
          )}
          {outcome.tally.length === 0 && (
            <li className="tally-row">
              <span>Every finger landed somewhere different.</span>
              <span className="tally-count">0</span>
            </li>
          )}
        </ul>
      </section>

      <Notebook notes={view.self?.notes ?? []} label="What you knew" />

      <footer className="setup-footer">
        {canControl && (
          <>
            <button className="btn btn-primary" onClick={() => dispatch({ type: "RESTART" })}>
              Same table, deal again
            </button>
            <button className="btn btn-ghost" onClick={() => dispatch({ type: "NEW_GAME" })}>
              Change the box
            </button>
          </>
        )}
        <Link className="hint" href="/" style={{ marginTop: 4 }}>
          Pick another game
        </Link>
      </footer>
    </>
  );
}

/**
 * One player's hand at the end: the card they were holding, their name under
 * it, and — only where it differs — what they were originally dealt. The role
 * name is not printed, because the art already says it across the top.
 */
function Hand({
  player,
  killed,
  shot,
}: {
  player: PlayerView;
  killed: boolean;
  shot: boolean;
}) {
  const final = player.final;
  if (!final) return null;
  const moved = player.dealt !== null && player.dealt !== final;

  return (
    <span
      className={`hand${killed ? " killed" : ""}`}
      style={{ ["--c" as string]: tint(final) }}
    >
      <CardFace role={final} size="md" />
      <span className="hand-name">{player.name}</span>
      {(killed || moved) && (
        <span className="hand-note">
          {killed && <span className="hand-fate">{shot ? "shot" : "killed"}</span>}
          {moved && <>dealt the {ROLE_INFO[player.dealt as Role].name}</>}
        </span>
      )}
    </span>
  );
}
