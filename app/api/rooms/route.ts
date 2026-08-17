import { NextResponse } from "next/server";
import { adapterFor } from "@/lib/room/engine";
import { present } from "@/lib/room/present";
import { createRoom, isConfigured } from "@/lib/room/store";
import { GAME_IDS, RoomError, type GameId } from "@/lib/room/types";
import { fail, readName } from "./_shared";

export const dynamic = "force-dynamic";

/** Lets the UI hide room play entirely when there is no Redis behind it. */
export async function GET() {
  return NextResponse.json({ configured: isConfigured() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { game?: string; name?: string };
    const game = body.game as GameId;
    if (!GAME_IDS.includes(game)) throw new RoomError("bad-action", "Unknown game.", 400);
    const name = readName(body.name);
    adapterFor(game); // rejects games with no room support

    const { room, seat } = await createRoom(game, name);
    return NextResponse.json({
      token: seat.token,
      room: present(room, seat),
    });
  } catch (error) {
    return fail(error);
  }
}
