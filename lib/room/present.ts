import { adapterFor } from "./engine";
import type { Room, RoomView, Seat } from "./types";

/**
 * Builds the payload for one client. Seat tokens never appear here, and the
 * game state is passed through its adapter's redaction first.
 */
export function present(room: Room, seat: Seat | null): RoomView {
  const adapter = adapterFor(room.game);
  return {
    code: room.code,
    game: room.game,
    phase: room.phase,
    version: room.version,
    selfId: seat?.id ?? null,
    isHost: Boolean(seat && seat.id === room.hostId),
    seats: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      isHost: s.id === room.hostId,
    })),
    state: room.state == null ? null : adapter.view(room.state, seat?.id ?? null),
  };
}
