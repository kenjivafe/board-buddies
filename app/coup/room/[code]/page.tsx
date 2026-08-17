import RoomGame from "@/components/coup/RoomGame";
import { normaliseCode } from "@/lib/room/store";

export default function CoupRoomPage({ params }: { params: { code: string } }) {
  return <RoomGame code={normaliseCode(params.code)} />;
}
