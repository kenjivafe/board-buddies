import RoomGame from "@/components/werewolf/RoomGame";
import { normaliseCode } from "@/lib/room/store";

export default function WerewolfRoomPage({ params }: { params: { code: string } }) {
  return <RoomGame code={normaliseCode(params.code)} />;
}
