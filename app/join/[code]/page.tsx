import { notFound, redirect } from "next/navigation";
import { normaliseCode, readRoom } from "@/lib/room/store";

export const dynamic = "force-dynamic";

/**
 * What a scanned QR lands on. The room knows which game it is, so this bounces
 * to that game's own route — which is what applies its skin.
 */
export default async function JoinPage({ params }: { params: { code: string } }) {
  const code = normaliseCode(params.code);
  if (code.length !== 4) notFound();

  const room = await readRoom(code).catch(() => null);
  if (!room) notFound();

  redirect(`/${room.game}/room/${room.code}`);
}
