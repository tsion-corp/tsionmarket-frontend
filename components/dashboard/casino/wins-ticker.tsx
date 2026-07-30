"use client";

import { useTranslations } from "next-intl";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { amountUsd } from "@/lib/casino/money";
import { timeAgo } from "@/lib/format";
import type { RecentWin } from "@/lib/casino/api/types";

// Horizontal marquee of recent wins across the casino. The list is rendered
// twice and the keyframe slides exactly half the track, so the loop is
// seamless. With too few wins to fill the track the marquee is left static
// rather than visibly stuttering.
const MIN_FOR_MARQUEE = 4;

export function WinsTicker({ wins }: { wins: RecentWin[] }) {
  const t = useTranslations("casino.hub");
  const wallet = useCasinoWallet();
  if (wins.length === 0) return null;

  const scrolling = wins.length >= MIN_FOR_MARQUEE;
  const items = scrolling ? [...wins, ...wins] : wins;

  return (
    <div>
      <div className="mb-2.5 text-[12px] font-semibold tracking-[0.06em] text-white/50 uppercase">
        {t("recentWins")}
      </div>
      <div className="ws-inset overflow-hidden rounded-[16px] py-3.5 whitespace-nowrap">
        <div
          className={`inline-flex gap-3.5 px-3.5 ${
            scrolling
              ? "[animation:ws-ticker-scroll_30s_linear_infinite] hover:[animation-play-state:paused]"
              : ""
          }`}
        >
          {items.map((w, i) => (
            <div
              key={`${w.id}-${i}`}
              className="inline-flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/5 py-2 pr-4 pl-2 backdrop-blur-md"
            >
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-white/6 text-[15px]">
                🏆
              </span>
              <span>
                <span className="ws-display tnum text-grey-100 block text-[14.5px]">
                  {wallet.format(amountUsd(w.amount, wallet.unitPriceUsd))}
                </span>
                <span className="block text-[10.5px] font-normal text-white/40">
                  {w.gameLabel} · {w.playerHandle} · {timeAgo(w.wonAt)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
