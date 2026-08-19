import type { Metadata } from "next";
import "./werewolf.css";

export const metadata: Metadata = {
  title: "One Night Werewolf",
  description: "One night, one argument, one vote. Your card may not be yours by morning.",
};

export default function WerewolfLayout({ children }: { children: React.ReactNode }) {
  return <div data-game="werewolf">{children}</div>;
}
