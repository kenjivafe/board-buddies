import type { Metadata } from "next";
import "./coup.css";

export const metadata: Metadata = {
  title: "Coup",
  description: "Two influences, no honesty, one survivor.",
};

export default function CoupLayout({ children }: { children: React.ReactNode }) {
  return <div data-game="coup">{children}</div>;
}
