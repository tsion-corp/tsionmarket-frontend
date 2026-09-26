"use client";

import { useTranslations } from "next-intl";
import { useModalScreen } from "@/components/ui/modal-shell";
import { ShineSettings } from "@/components/shine/shine-settings";

/**
 * Shine as a screen inside an existing sheet, for the phone's account modal.
 *
 * The desktop menu opens ShineSheet, which brings its own shell. Here the
 * shell already exists, so this registers a Back with it rather than stacking
 * a second modal on top of the first.
 */
export function ShineScreen({ onBack }: { onBack: () => void }) {
  const t = useTranslations("shine");
  useModalScreen({ back: onBack });

  return (
    <div className="p-5 sm:p-6">
      <div className="ws-display text-[22px]">{t("settingsTitle")}</div>
      <ShineSettings className="mt-4" />
    </div>
  );
}
