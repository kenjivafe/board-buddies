import RoomGame from "@/components/kings-cup/RoomGame";
import { normaliseCode } from "@/lib/room/store";

export default function KingsCupRoomPage({ params }: { params: { code: string } }) {
  return <RoomGame code={normaliseCode(params.code)} />;
}
