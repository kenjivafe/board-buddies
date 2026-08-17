"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Deliberately NOT themed. A QR needs dark modules on a light field with a
 * quiet zone around it to scan reliably, so the colours are baked in rather
 * than inherited — a code drawn in a game's palette can look right and still
 * fail every camera pointed at it.
 */
const DARK = "#17130f";
const PAPER = "#f4efe4";

export default function Qr({ url, label }: { url: string; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: DARK, light: PAPER },
    })
      .then((markup) => live && setSvg(markup))
      .catch(() => setSvg(null));
    return () => {
      live = false;
    };
  }, [url]);

  if (!svg) return <div className="qr qr-loading" aria-hidden />;

  return (
    <div className="qr" role="img" aria-label={label ?? `QR code for ${url}`}>
      <div className="qr-ink" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
