import { present } from "@/lib/room/present";
import { normaliseCode, readRoom, readVersion } from "@/lib/room/store";

export const dynamic = "force-dynamic";
/** Vercel caps how long a function may run; the stream closes itself first. */
export const maxDuration = 60;

/**
 * Upstash speaks Redis over REST, and SUBSCRIBE is a blocking command REST
 * cannot carry — so there is no pub/sub to hang off. Instead this polls the
 * room's version key (one cheap GET) and only reads and pushes the full room
 * when it actually changes. EventSource reconnects on its own when the stream
 * closes, which is what keeps this inside the function duration cap.
 */
const POLL_MS = Number(process.env.ROOM_POLL_MS ?? 1500);
const STREAM_MS = 50_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: Request, { params }: { params: { code: string } }) {
  const code = normaliseCode(params.code);
  const token = new URL(request.url).searchParams.get("t");
  const encoder = new TextEncoder();

  let aborted = false;
  request.signal.addEventListener("abort", () => {
    aborted = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const deadline = Date.now() + STREAM_MS;
      let lastVersion = -1;

      try {
        while (!aborted && Date.now() < deadline) {
          const version = await readVersion(code);
          if (version == null) {
            // tells the client to stop reconnecting, which EventSource
            // would otherwise do forever
            send("gone", { error: "That room has closed or expired." });
            break;
          }
          if (version !== lastVersion) {
            const room = await readRoom(code);
            if (!room) {
              send("gone", { error: "That room has closed or expired." });
              break;
            }
            lastVersion = room.version;
            const seat = token ? room.seats.find((s) => s.token === token) ?? null : null;
            send("room", present(room, seat));
          }
          if (aborted) break;
          await sleep(POLL_MS);
        }
      } catch (error) {
        console.error("[rooms] stream", error);
        send("gone", { error: "Lost the connection to that room." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed by the client hanging up */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // proxies that buffer would defeat the whole point
      "X-Accel-Buffering": "no",
    },
  });
}
