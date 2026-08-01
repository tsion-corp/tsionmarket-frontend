"use client";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PerpModeSwitch } from "@/components/dashboard/trade/perp-mode";
import { PerpsView } from "@/components/dashboard/trade/perps-view";

// Perpetuals as its own sidebar section: the header carries the simple/pro
// switch, the body is the perps desk. Spot lives in its own section now.
export function PerpsSection() {
  const tSections = useTranslations("sections");

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>{tSections("perps")}</Eyebrow>
        <PerpModeSwitch />
      </div>
      <div className="mt-4">
        <PerpsView />
      </div>
    </div>
  );
}
