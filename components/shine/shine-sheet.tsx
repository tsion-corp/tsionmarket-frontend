"use client";

import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { ShineSettings } from "@/components/shine/shine-settings";

interface ShineSheetProps {
  open: boolean;
  onClose: () => void;
}

// Shine's one home, opened from the account menu.
//
// Hosted by the sidebar rather than by the popover that opens it: the popover
// closes on an outside click, and a sheet rendered inside it would go with it
// the moment somebody reached for a switch.
export function ShineSheet({ open, onClose }: ShineSheetProps) {
  const t = useTranslations("shine");

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="p-5 sm:p-6">
        <div className="ws-display text-[22px]">{t("settingsTitle")}</div>
        <ShineSettings className="mt-4" />
      </div>
    </ModalShell>
  );
}
