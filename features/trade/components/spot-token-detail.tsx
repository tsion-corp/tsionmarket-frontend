"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DetailModal } from "@/components/layout/modals/detail-modal";
import { ModalShell } from "@/components/ui/modal-shell";
import { BuySheet } from "@/features/trade/components/buy-sheet";
import { useSpotMarkets } from "@/features/trade/hooks/use-spot-markets";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";
import type { DetailPayload } from "@/lib/modal-types";

function changeLabel(chg: number): string {
  const v = Number.isFinite(chg) ? chg : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

// One spot token on its own page (route /spot/[id]), in place of the detail
// popup: the chart, the stats, and a Buy call-to-action. The id is the token
// symbol; the market is looked up from the spot feed. Buying still opens the
// buy sheet, which is a transaction flow rather than a screen.
export function SpotTokenDetail({ id }: { id: string }) {
  const t = useTranslations("markets");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { markets, loading, error } = useSpotMarkets();
  const [buyOpen, setBuyOpen] = useState(false);

  const token = useMemo(
    () => markets.find((m) => m.symbol.toLowerCase() === id.toLowerCase()) ?? null,
    [markets, id]
  );
  // The list loaded fine but this symbol is not in it: a stale link or a
  // delisted token. That is "not found", not "prices are down" — the two must
  // read differently or the user retries a page that will never resolve.
  const notFound = !loading && !error && !token;

  // On a deep link / fresh tab there is no in-app history, so a bare back()
  // strands the user (or leaves the site). Fall back to the spot list.
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/spot");
  };

  const detail: DetailPayload | null = token
    ? {
        sym: token.symbol,
        name: token.name,
        sub: token.symbol,
        price: token.priceUsd > 0 ? formatUsd(token.priceUsd) : "—",
        chg: changeLabel(token.change24h),
        bg: tokenBg(token.symbol),
        coingeckoId: token.coingeckoId ?? undefined,
        up: token.change24h >= 0,
        logo: token.logo,
        // Spot shows candles only, no area chart.
        candlesOnly: true,
        stats: [
          { k: t("price"), v: token.priceUsd > 0 ? formatUsd(token.priceUsd) : "—" },
          { k: t("change24hFull"), v: changeLabel(token.change24h) },
          { k: t("marketCap"), v: compactUsd(token.marketCap) },
        ],
        cta: t("buyToken", { name: token.name }),
        onCta: () => setBuyOpen(true),
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-[560px] p-4 sm:p-6">
      <button
        type="button"
        onClick={goBack}
        className="ws-pressable mb-4 flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-white/60 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" aria-hidden>
          <path
            d="M15 6l-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {tCommon("back")}
      </button>

      {detail ? (
        <DetailModal detail={detail} />
      ) : notFound ? (
        <div className="ws-card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-[13.5px] font-normal text-white/55">{t("tokenNotFound")}</p>
          <button
            type="button"
            onClick={() => router.push("/spot")}
            className="text-ink cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            {t("backToMarkets")}
          </button>
        </div>
      ) : (
        <div className="ws-card px-6 py-16 text-center text-[13.5px] font-normal text-white/45">
          {loading ? t("loadingMarkets") : t("marketsUnavailable")}
        </div>
      )}

      {/* Buying is still a sheet: it is a short transaction flow, not a screen. */}
      <ModalShell open={buyOpen} onClose={() => setBuyOpen(false)} contentKey="spot-buy" size="md">
        {token ? (
          <BuySheet
            payload={{
              symbol: token.symbol,
              name: token.name,
              priceUsd: token.priceUsd,
              logo: token.logo,
            }}
            onClose={() => setBuyOpen(false)}
          />
        ) : null}
      </ModalShell>
    </div>
  );
}
