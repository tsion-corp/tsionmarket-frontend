"use client";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PerpModeSwitch } from "@/features/trade/components/perp-mode";
import { PerpsView } from "@/features/trade/components/perps-view";
import { SectionVisibility } from "@/components/ui/section-visibility";

// Perpetuals as its own sidebar section: the header carries the simple/pro
// switch, the body is the perps desk. Spot lives in its own section now.
//
// Both interfaces are offered at every width; each moves its chart and order
// ticket into a full-screen sheet on a phone, so the section stays a short
// market list until a market is chosen.
export function PerpsSection() {
  const tSections = useTranslations("sections");
  return (
    <SectionVisibility className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>{tSections("perps")}</Eyebrow>
        <PerpModeSwitch />
      </div>
      <div className="mt-4">
        <PerpsView />
      </div>
    </SectionVisibility>
  );
}
