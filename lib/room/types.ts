export type GameId = "kings-cup" | "coup" | "werewolf";

export const GAME_IDS: GameId[] = ["kings-cup", "coup", "werewolf"];

export interface Seat {
  id: string;
  name: string;
  /** per-device secret. Never included in anything sent to a client but its owner. */
  token: string;
  joinedAt: number;
}

export type RoomPhase = "lobby" | "playing";

/** The authoritative room, as stored. Only ever lives on the server. */
export interface Room {
  code: string;
  game: GameId;
  phase: RoomPhase;
  hostId: string;
  seats: Seat[];
  /** game state, shaped by `game`; null until the host starts */
  state: unknown;
  createdAt: number;
  /** bumped on every write; clients poll this to detect changes */
  version: number;
}

export type StoredRoom = Omit<Room, "version">;

/** What one client is allowed to know. */
export interface RoomView {
  code: string;
  game: GameId;
  phase: RoomPhase;
  version: number;
  selfId: string | null;
  isHost: boolean;
  seats: { id: string; name: string; isHost: boolean }[];
  /** game state redacted for this viewer */
  state: unknown;
}

export type RoomErrorCode =
  | "not-configured"
  | "not-found"
  | "full"
  | "name-taken"
  | "already-started"
  | "not-started"
  | "forbidden"
  | "bad-action"
  | "conflict";

export class RoomError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "RoomError";
  }
}
