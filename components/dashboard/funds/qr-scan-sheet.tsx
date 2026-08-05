"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { useQrScanner } from "@/hooks/use-qr-scanner";

interface QrScanSheetProps {
  open: boolean;
  onClose: () => void;
  // Fires with the raw decoded string; the caller (not this sheet) is
  // responsible for stripping any URI wrapper and validating the address, the
  // same way it already validates a pasted one.
  onScan: (value: string) => void;
}

// Camera sheet for scanning a destination wallet address as a QR code, as an
// alternative to pasting it. The camera only opens while this sheet is open
// and is released the moment a code is found, the user cancels, or the sheet
// closes any other way (ModalShell's own dismissal included).
export function QrScanSheet({ open, onClose, onScan }: QrScanSheetProps) {
  const t = useTranslations("fundsFlow");
  const { videoRef, error, start, stop } = useQrScanner((value) => {
    onScan(value);
    onClose();
  });

  useEffect(() => {
    if (!open) return;
    void start();
    return () => stop();
    // start/stop are stable (useCallback with stable deps); re-running this
    // effect should only be driven by the sheet opening or closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="ws-display mb-1 text-[20px] tracking-[-0.01em]">{t("scanAddressTitle")}</div>
      <p className="mb-4 text-[13.5px] leading-normal font-normal text-white/60">
        {t("scanAddressSubtitle")}
      </p>
      {error ? (
        <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-8 text-center text-[13px] font-normal text-white/75">
          {error === "denied" ? t("cameraDenied") : t("cameraUnavailable")}
        </div>
      ) : (
        <div className="relative aspect-square w-full overflow-hidden rounded-[16px] bg-black">
          {/* Local camera preview only, never uploaded; muted+playsInline is
              required for autoplay on iOS Safari. */}
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-8 rounded-[16px] border-2 border-white/70"
          />
        </div>
      )}
    </ModalShell>
  );
}
