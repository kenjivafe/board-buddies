import type { GameState } from "./types";

/**
 * What a room sends King's Cup clients. Every card, rule and tally in this game
 * is public, so the only thing withheld is the undo stack — and that is
 * bandwidth rather than secrecy.
 */
export type KcView = Omit<GameState, "past">;

export function viewFor(state: GameState): KcView {
  const { past: _past, ...rest } = state;
  return rest;
}
