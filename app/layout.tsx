import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
// wdth.css carries the width axis too — Coup sets condensed heavy caps with it
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/instrument-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Board Buddies",
    template: "%s · Board Buddies",
  },
  description: "Party games for one phone and a full table.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#12100E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
