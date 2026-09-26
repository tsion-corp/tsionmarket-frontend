"use client";

import { QRCodeSVG } from "qrcode.react";

interface QrCodeProps {
  value: string;
  size?: number;
  /** Drop the white frame, for a caller whose own tile already supplies one.
   *  Two nested white boxes only shrink the code the scanner has to read. */
  bare?: boolean;
}

// White-framed QR so wallet camera scanners get the contrast they need against
// the dark sheet.
export function QrCode({ value, size = 168, bare = false }: QrCodeProps) {
  const code = <QRCodeSVG value={value} size={size} level="M" marginSize={0} />;
  if (bare) return code;
  return <span className="inline-block rounded-[16px] bg-white p-3">{code}</span>;
}
