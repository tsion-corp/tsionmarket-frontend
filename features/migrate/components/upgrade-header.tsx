"use client";

import { useTranslations } from "next-intl";
import { ClockIcon } from "@/components/ui/icons";
import type { UpgradeView } from "@/features/migrate/lib/upgrade-progress";

/**
 * Which door the reader came through. `gate` is the upgrade the app holds open
 * on first arrival; `finish` is the same modal reopened from "Finish upgrading
 * my old account" in the account menu, for somebody picking up where they left
 * off. Same modal, same bar — only the opening words change, because "Update
 * your account" to somebody halfway through reads as it having started over.
 */
export type UpgradeHeaderVariant = "gate" | "finish";

const COPY: Record<UpgradePhaseKey, { title: string; intro: string }> = {
  intro: { title: "updateTitle", intro: "updateIntro" },
  finish: { title: "finishTitle", intro: "finishIntro" },
  progress: { title: "updatingTitle", intro: "updatingIntro" },
  done: { title: "readyTitle", intro: "readyIntro" },
};
type UpgradePhaseKey = "intro" | "finish" | "progress" | "done";

/**
 * THE TOP OF THE UPGRADE MODAL — the design's card, in three states.
 *
 * The hero art bleeds to the card's edges; under it the MARKET 2.0 mark, the
 * title and a line of grey. Then, by phase: the estimated time (intro), a
 * single gold bar with "In Progress" over it and what is happening under it
 * (progress), or the full bar with "100%" and "Update Complete" (done).
 *
 * Nothing else lives here. The action and the details sit below, in the
 * body the gate or the sheet renders.
 */
export function UpgradeHeader({
  view,
  variant = "gate",
}: {
  view: UpgradeView;
  variant?: UpgradeHeaderVariant;
}) {
  const t = useTranslations("migrate");
  const key: UpgradePhaseKey =
    view.phase === "intro" ? (variant === "finish" ? "finish" : "intro") : view.phase;
  const copy = COPY[key];
  const hero = view.phase === "done" ? "/migrate/upgrade-done.svg" : "/migrate/upgrade-top.svg";

  return (
    <header>
      {/* eslint-disable-next-line @next/next/no-img-element -- static art, sized by the card */}
      <img
        src={hero}
        alt=""
        aria-hidden
        width={598}
        height={149}
        className="block aspect-[598/149] w-full object-cover"
      />
      <div className="px-[26px] pt-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- the wordmark, as delivered */}
        <img
          src="/migrate/market-2.0.svg"
          alt="Market 2.0"
          width={140}
          height={18}
          className="mx-auto h-[18px] w-auto"
        />
        <h2 className="ws-display mt-4 text-[30px] leading-[1.08] tracking-[-0.02em] text-white md:text-[34px]">
          {t(copy.title)}
        </h2>
        <p className="mx-auto mt-3 max-w-[40ch] text-[15px] leading-[1.45] text-white/60">
          {t(copy.intro)}
        </p>

        {view.phase === "intro" ? (
          <p className="mx-auto mt-6 inline-flex items-center gap-2.5 rounded-full bg-[#F7A92F14] px-5 py-2.5 text-[14px] font-medium">
            <ClockIcon size={18} className="text-upgrade" />
            {/* White into gold, as the design draws it. */}
            <span className="to-upgrade bg-gradient-to-r from-white bg-clip-text text-transparent">
              {t("estimatedTime")}
            </span>
          </p>
        ) : (
          <div className="mt-8" aria-live="polite">
            <div className="flex justify-end">
              <span
                className={`text-[14px] font-medium ${
                  view.phase === "done" ? "text-upgrade" : "text-upgrade-progress"
                }`}
              >
                {view.phase === "done" ? "100%" : t("inProgress")}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.pct}
              className="mt-2 h-[12px] overflow-hidden rounded-full bg-[#2A2A2A]"
            >
              <div
                className="bg-upgrade h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
                style={{ width: `${view.pct}%` }}
              />
            </div>
            <p className="mt-3 text-[14px] text-white/60">{view.caption ? t(view.caption) : ""}</p>
          </div>
        )}
      </div>
    </header>
  );
}
