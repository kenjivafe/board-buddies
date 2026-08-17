import { Redis } from "@upstash/redis";
import { RoomError, type GameId, type Room, type Seat, type StoredRoom } from "./types";

/** Rooms are disposable — a party game outlives its state by a few hours at most. */
const TTL_SECONDS = 60 * 60 * 6;
export const MAX_SEATS = 8;

/** No I, O, 0 or 1 — these get read aloud and typed in by hand. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

let client: Redis | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function redis(): Redis {
  if (!isConfigured()) {
    throw new RoomError(
      "not-configured",
      "Rooms need a Redis connection. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      503
    );
  }
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return client;
}

const dataKey = (code: string) => `bb:room:${code}:data`;
const versionKey = (code: string) => `bb:room:${code}:v`;

/**
 * Compare-and-set. The version lives in its own key so the check is a plain
 * string compare — no need to decode the room blob inside Lua. Returns the new
 * version, or 0 if someone else wrote first.
 */
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then return 0 end
local next = tonumber(ARGV[1]) + 1
redis.call('SET', KEYS[1], next, 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return next
`;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newSeat(name: string): Seat {
  return { id: crypto.randomUUID(), name, token: crypto.randomUUID(), joinedAt: Date.now() };
}

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, CODE_LENGTH);
}

/** Cheap poll target — one GET, used by the stream to detect changes. */
export async function readVersion(code: string): Promise<number | null> {
  const v = await redis().get<number | string>(versionKey(code));
  return v == null ? null : Number(v);
}

export async function readRoom(code: string): Promise<Room | null> {
  const r = redis();
  const [data, version] = await Promise.all([
    r.get<StoredRoom>(dataKey(code)),
    r.get<number | string>(versionKey(code)),
  ]);
  if (!data || version == null) return null;
  return { ...data, version: Number(version) };
}

export async function requireRoom(code: string): Promise<Room> {
  const room = await readRoom(code);
  if (!room) throw new RoomError("not-found", "That room has closed or expired.", 404);
  return room;
}

export async function createRoom(game: GameId, hostName: string): Promise<{ room: Room; seat: Seat }> {
  const r = redis();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    // claiming the version key doubles as the collision check
    const claimed = await r.set(versionKey(code), 1, { nx: true, ex: TTL_SECONDS });
    if (claimed !== "OK") continue;

    const seat = newSeat(hostName);
    const stored: StoredRoom = {
      code,
      game,
      phase: "lobby",
      hostId: seat.id,
      seats: [seat],
      state: null,
      createdAt: Date.now(),
    };
    await r.set(dataKey(code), stored, { ex: TTL_SECONDS });
    return { room: { ...stored, version: 1 }, seat };
  }
  throw new RoomError("conflict", "Could not find a free room code. Try again.", 503);
}

/**
 * Read, mutate, write — retrying when another device wrote in between, so two
 * people tapping at once can't clobber each other.
 */
export async function mutateRoom(
  code: string,
  mutate: (room: Room) => Room | Promise<Room>
): Promise<Room> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await requireRoom(code);
    const next = await mutate(current);
    const { version: _ignored, ...stored } = next;
    const result = await redis().eval(
      CAS_SCRIPT,
      [versionKey(code), dataKey(code)],
      [String(current.version), JSON.stringify(stored), String(TTL_SECONDS)]
    );
    const version = Number(result);
    if (version > 0) return { ...(stored as StoredRoom), version };
  }
  throw new RoomError("conflict", "Too many people acted at once. Try that again.", 409);
}

export function seatByToken(room: Room, token: string | null): Seat {
  const seat = token ? room.seats.find((s) => s.token === token) : undefined;
  if (!seat) throw new RoomError("forbidden", "You are not seated in this room.", 403);
  return seat;
}
