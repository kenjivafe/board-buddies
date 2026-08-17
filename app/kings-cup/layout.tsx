import type { Metadata } from "next";
import "./kings-cup.css";

export const metadata: Metadata = {
  title: "King's Cup",
  description: "The card game, minus the arguments about who's Thumb Master.",
};

export default function KingsCupLayout({ children }: { children: React.ReactNode }) {
  return <div data-game="kings-cup">{children}</div>;
}
