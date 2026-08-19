import { NextResponse } from "next/server";
import { adapterFor, type StartOptions } from "@/lib/room/engine";
import { present } from "@/lib/room/present";
import {
  MAX_SEATS,
  mutateRoom,
  newSeat,
  normaliseCode,
  requireRoom,
  seatByToken,
} from "@/lib/room/store";
import { RoomError } from "@/lib/room/types";
import { fail, readName } from "../_shared";

export const dynamic = "force-dynamic";

type Params = { params: { code: string } };

/** Current view for whoever is asking. */
export async function GET(request: Request, { params }: Params) {
  try {
    const code = normaliseCode(params.code);
    const room = await requireRoom(code);
    const token = new URL(request.url).searchParams.get("t");
    const seat = token ? room.seats.find((s) => s.token === token) ?? null : null;
    return NextResponse.json({ room: present(room, seat) });
  } catch (error) {
    return fail(error);
  }
}

type Body =
  | { op: "join"; name: string }
  | { op: "start"; token: string; options?: StartOptions }
  | { op: "action"; token: string; action: unknown }
  | { op: "leave"; token: string }
  | { op: "drop"; token: string; seatId: string };

export async function POST(request: Request, { params }: Params) {
  try {
    const code = normaliseCode(params.code);
    const body = (await request.json()) as Body;

    // ---- join: anyone with the code, until the game starts ----
    if (body.op === "join") {
      const name = readName(body.name);
      let token = "";
      const room = await mutateRoom(code, (current) => {
        if (current.phase !== "lobby") {
          throw new RoomError("already-started", "That game has already started.", 409);
        }
        const adapter = adapterFor(current.game);
        const limit = Math.min(adapter.maxSeats, MAX_SEATS);
        if (current.seats.length >= limit) {
          throw new RoomError("full", `This room is full at ${limit} players.`, 409);
        }
        if (current.seats.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          throw new RoomError("name-taken", "Someone here is already using that name.", 409);
        }
        const seat = newSeat(name);
        token = seat.token;
        return { ...current, seats: [...current.seats, seat] };
      });
      const seat = room.seats.find((s) => s.token === token)!;
      return NextResponse.json({ token, room: present(room, seat) });
    }

    // everything below needs a seat
    const existing = await requireRoom(code);
    const me = seatByToken(existing, body.token);

    if (body.op === "leave") {
      const room = await mutateRoom(code, (current) => {
        // leaving mid-game would strand the state, so only the lobby lets go
        if (current.phase !== "lobby") return current;
        const seats = current.seats.filter((s) => s.id !== me.id);
        if (seats.length === 0) return current;
        const hostId = seats.some((s) => s.id === current.hostId) ? current.hostId : seats[0].id;
        return { ...current, seats, hostId };
      });
      return NextResponse.json({ room: present(room, null) });
    }

    /*
     * The host clears out a seat nobody is sitting in.
     *
     * "Leave room" only works for somebody who is still looking at the page.
     * Close the tab, lose the phone, or join twice by mistake and the seat
     * stays — and then the game deals that seat a hand and waits on it all
     * night. This is the way out of that, and it is lobby-only for the same
     * reason leaving is: removing a player mid-game would strand the state.
     */
    if (body.op === "drop") {
      const room = await mutateRoom(code, (current) => {
        if (current.hostId !== me.id) {
          throw new RoomError("forbidden", "Only the host can remove players.", 403);
        }
        if (current.phase !== "lobby") {
          throw new RoomError("already-started", "The game has already started.", 409);
        }
        if (body.seatId === current.hostId) {
          throw new RoomError("bad-action", "The host cannot remove themselves.", 400);
        }
        const seats = current.seats.filter((s) => s.id !== body.seatId);
        if (seats.length === current.seats.length) {
          throw new RoomError("not-found", "That player has already gone.", 404);
        }
        return { ...current, seats };
      });
      return NextResponse.json({ room: present(room, me) });
    }

    if (body.op === "start") {
      const room = await mutateRoom(code, (current) => {
        if (current.hostId !== me.id) {
          throw new RoomError("forbidden", "Only the host can start the game.", 403);
        }
        const adapter = adapterFor(current.game);
        if (current.seats.length < adapter.minSeats) {
          throw new RoomError(
            "bad-action",
            `${current.game === "coup" ? "Coup" : "King's Cup"} needs at least ${adapter.minSeats} players.`,
            400
          );
        }
        if (current.seats.length > adapter.maxSeats) {
          throw new RoomError("full", `Too many players for this game.`, 400);
        }
        return {
          ...current,
          phase: "playing" as const,
          state: adapter.start(current.seats, body.options ?? {}),
        };
      });
      return NextResponse.json({ room: present(room, me) });
    }

    if (body.op === "action") {
      const room = await mutateRoom(code, (current) => {
        if (current.phase !== "playing" || current.state == null) {
          throw new RoomError("not-started", "The game has not started yet.", 409);
        }
        const adapter = adapterFor(current.game);
        const next = adapter.apply(current.state, body.action, me.id, current.hostId === me.id);
        // a reducer that returns its input rejected the move
        if (next === current.state) {
          throw new RoomError("bad-action", "That move isn't available right now.", 409);
        }
        // "change players" lands the game back at its own setup screen, which a
        // room has no use for — the seats are the roster, so return to the lobby
        if (adapter.atSetup(next)) {
          return { ...current, phase: "lobby" as const, state: null };
        }
        return { ...current, state: next };
      });
      return NextResponse.json({ room: present(room, me) });
    }

    throw new RoomError("bad-action", "Unknown operation.", 400);
  } catch (error) {
    return fail(error);
  }
}
