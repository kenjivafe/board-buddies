import { NextResponse } from "next/server";
import { RoomError } from "@/lib/room/types";

export const MAX_NAME = 18;

export function readName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_NAME) : "";
  if (!name) throw new RoomError("bad-action", "Enter a name first.", 400);
  return name;
}

export function fail(error: unknown) {
  if (error instanceof RoomError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("[rooms]", error);
  return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
}
