"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameId, RoomView } from "@/lib/room/types";

const KEY = "bb:rooms:v1";

type Credentials = Record<string, string>;

function readCredentials(): Credentials {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Credentials;
  } catch {
    return {};
  }
}

/** Seat tokens are per device, so they live beside the game saves. */
export function rememberToken(code: string, token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readCredentials(), [code]: token }));
  } catch {
    /* private browsing — the room still works for this tab */
  }
}

export function recallToken(code: string): string | null {
  return readCredentials()[code] ?? null;
}

export function forgetToken(code: string) {
  try {
    const all = readCredentials();
    delete all[code];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* nothing to clean up */
  }
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "That didn't work.");
  return data as T;
}

export async function createRoom(game: GameId, name: string) {
  const { token, room } = await call<{ token: string; room: RoomView }>("/api/rooms", {
    game,
    name,
  });
  rememberToken(room.code, token);
  return room;
}

export async function joinRoom(code: string, name: string) {
  const { token, room } = await call<{ token: string; room: RoomView }>(`/api/rooms/${code}`, {
    op: "join",
    name,
  });
  rememberToken(room.code, token);
  return room;
}

export type RoomStatus = "connecting" | "live" | "gone" | "error";

/**
 * Subscribes to one room. The stream carries the whole redacted room on every
 * change, so there is no client-side merging to get wrong; actions POST and
 * apply the response immediately rather than waiting for the next push.
 */
export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const token = useMemo(() => (typeof window === "undefined" ? null : recallToken(code)), [code]);
  // the stream can deliver an older view than a just-POSTed response
  const seen = useRef(-1);

  const accept = useCallback((next: RoomView) => {
    if (next.version < seen.current) return;
    seen.current = next.version;
    setRoom(next);
  }, []);

  useEffect(() => {
    if (!code) return;
    let closed = false;
    let source: EventSource | null = null;

    const open = () => {
      if (closed) return;
      const query = token ? `?t=${encodeURIComponent(token)}` : "";
      source = new EventSource(`/api/rooms/${code}/stream${query}`);

      source.addEventListener("room", (event) => {
        accept(JSON.parse((event as MessageEvent).data) as RoomView);
        setStatus("live");
        setError(null);
      });

      source.addEventListener("gone", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { error?: string };
        closed = true;
        source?.close();
        setStatus("gone");
        setError(payload.error ?? "That room has closed.");
      });

      // EventSource retries on its own after the stream's own timeout, so an
      // error here only matters if we never got anything at all
      source.onerror = () => {
        if (closed) source?.close();
      };
    };

    open();
    return () => {
      closed = true;
      source?.close();
    };
  }, [code, token, accept]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      if (!token) throw new Error("You are not seated in this room.");
      try {
        const { room: next } = await call<{ room: RoomView }>(`/api/rooms/${code}`, {
          ...body,
          token,
        });
        accept(next);
        setError(null);
        return next;
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "That didn't work.");
        throw thrown;
      }
    },
    [code, token, accept]
  );

  const dispatch = useCallback(
    (action: unknown) => {
      void send({ op: "action", action }).catch(() => {
        /* surfaced through `error` */
      });
    },
    [send]
  );

  const start = useCallback(
    (options?: Record<string, unknown>) => send({ op: "start", options }),
    [send]
  );

  const leave = useCallback(async () => {
    await send({ op: "leave" }).catch(() => {});
    forgetToken(code);
  }, [send, code]);

  return {
    room,
    status,
    error,
    seated: Boolean(token),
    dispatch,
    start,
    leave,
    clearError: () => setError(null),
  };
}
