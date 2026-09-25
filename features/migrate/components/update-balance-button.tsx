"use client";

import { useTranslations } from "next-intl";
import { RefreshIcon } from "@/components/ui/icons";
import { useOfferMigration } from "@/features/migrate/hooks/use-offer-migration";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";
import { openMigration } from "@/features/migrate/lib/migration-card-store";

/**
 * The balance card's door to the upgrade.
 *
 * It used to run the sweep itself, with its own review and its own summary —
 * a third copy of the flow beside the gate and the sheet, and the one that
 * showed "moved USDC on Base" before the gate ran the whole thing again. It
 * opens the one card now and does nothing else.
 */
export function UpdateBalanceButton() {
  const t = useTranslations("migrate");
  const offer = useOfferMigration();
  const linked = useMigrationStatus().data?.linked === true;
  if (!offer) return null;
  return (
    // Dressed as Withdraw, because it sits in that row and a third visual
    // language there reads as an advert rather than an action. One node
    // renders into both cards — only one is ever visible — so the phone
    // shape is the base and the desktop one arrives at md, matching
    // balance-card-mobile's `action` and balance-card-desktop's pill.
    <button
      onClick={() => openMigration("balance_card")}
      className="ws-pressable flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-white bg-white/6 py-[12px] font-sans text-[15px] font-semibold tracking-[-0.15px] whitespace-nowrap text-white transition-opacity active:bg-white/12 md:gap-[8px] md:border-[1.53px] md:px-[24px] md:py-[19.88px] md:font-serif md:text-[21px] md:leading-[1.1] md:tracking-[-0.21px]"
    >
      <RefreshIcon size={15} className="shrink-0 md:size-[26.49px]" />
      {linked ? t("updateBalanceLinked") : t("updateBalance")}
    </button>
  );
}
