"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Identicon } from "@/components/ui/identicon";

type Translator = ReturnType<typeof useTranslations>;
import { useActivity } from "@/features/prediction/hooks/use-prediction-detail";
import { compactUsd, priceToCents, shortAddress, timeAgo } from "@/features/prediction/lib/format";
import type { ActivityItem } from "@/features/prediction/lib/types";

// Activity feed for a market — a live-ish stream of who did what, how much, at
// what price (Polymarket's "Activity" tab). Backed by the indexer's Activity
// projection, cursor-paginated. New trades also arrive via the WS stream on the
// detail page; this feed is the durable, paginated history.

interface ActivityFeedProps {
  marketId: string;
}

export function ActivityFeed({ marketId }: ActivityFeedProps) {
  const t = useTranslations("prediction");
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivity(marketId);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  return (
    <div className="ws-card p-5 sm:p-6" data-sensitive="position">
      <span className="ws-display mb-4 block text-[15px]">{t("activity")}</span>

      {isLoading ? (
        <p className="py-6 text-center text-[13px] font-normal text-white/45">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-[13px] font-normal text-white/45">
          {t("activity_empty")}
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-white/[0.06]">
            {items.map((a) => (
              <ActivityRow key={a.id} item={a} label={activityLabel(a, t)} />
            ))}
          </ul>
          {hasNextPage ? (
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-3 w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[12.5px] font-medium text-white/60 hover:text-white disabled:opacity-60"
            >
              {isFetchingNextPage ? t("loading") : t("loadMore")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ActivityRow({ item, label }: { item: ActivityItem; label: string }) {
  const tone =
    item.kind === "trade" && item.side
      ? item.side === "yes"
        ? "text-up"
        : "text-down"
      : "text-white/70";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="overflow-hidden rounded-full">
        <Identicon seed={item.actor || item.marketId.toString()} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-white/85">
          <span className="font-mono text-white/60">{shortAddress(item.actor)}</span>{" "}
          <span className={tone}>{label}</span>
        </p>
      </div>
      <span className="shrink-0 text-[11.5px] font-normal text-white/35 tabular-nums">
        {timeAgo(item.at)}
      </span>
    </li>
  );
}

// Renders "bought $1,742 YES @ 30¢" style lines from an activity item.
function activityLabel(a: ActivityItem, t: Translator): string {
  switch (a.kind) {
    case "trade": {
      const verb = a.buy ? t("act_bought") : t("act_sold");
      const amount = a.usdcAmount != null ? compactUsd(a.usdcAmount) : "";
      const side = a.side ? a.side.toUpperCase() : "";
      const at =
        a.priceYes != null
          ? ` @ ${priceToCents(a.side === "no" ? BigInt(1_000_000) - a.priceYes : a.priceYes)}`
          : "";
      return `${verb} ${amount} ${side}${at}`.trim();
    }
    case "lp_add":
      return `${t("act_addedLiquidity")} ${a.usdcAmount != null ? compactUsd(a.usdcAmount) : ""}`.trim();
    case "lp_remove":
      return `${t("act_removedLiquidity")} ${a.usdcAmount != null ? compactUsd(a.usdcAmount) : ""}`.trim();
    case "redeem":
      return `${t("act_redeemed")} ${a.usdcAmount != null ? compactUsd(a.usdcAmount) : ""}`.trim();
    case "resolved":
      return t("act_resolved");
    default:
      return "";
  }
}
