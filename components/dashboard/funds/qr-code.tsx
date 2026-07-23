"use client";

import { QRCodeSVG } from "qrcode.react";

interface QrCodeProps {
  value: string;
  size?: number;
}

// White-framed QR so wallet camera scanners get the contrast they need against
// the dark sheet.
export function QrCode({ value, size = 168 }: QrCodeProps) {
  return (
    <span className="inline-block rounded-[16px] bg-white p-3">
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} />
    </span>
  );
}
