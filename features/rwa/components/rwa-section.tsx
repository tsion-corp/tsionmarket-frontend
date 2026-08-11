"use client";

import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { RwaAssetList } from "@/features/rwa/components/rwa-asset-list";
import { RwaTradePanel } from "@/features/rwa/components/rwa-trade-panel";
import { RwaDetailSheet } from "@/features/rwa/components/rwa-detail-sheet";
import { useRwaAssets } from "@/features/rwa/hooks/use-rwa-assets";
import { useTradePrefill } from "@/hooks/use-trade-prefill";
import {
  dedupeByChain,
  isLiveChain,
  isTradable,
  isUsableAsset,
} from "@/features/rwa/lib/presenter";
import { useRwaEnrichedAssets } from "@/features/rwa/hooks/use-rwa-prices";
import type { RwaApiAsset } from "@/features/rwa/lib/api";
import type { TradePrefill } from "@/lib/voice/intent";
import type { ConfirmPayload, DetailPayload } from "@/lib/modal-types";

// The dashboard page passes detail and confirm openers, but the RWA section owns
// its own detail sheet and trade flow, so it does not use them. The prop shape
// stays as the page expects so the dashboard keeps compiling.
export interface RwaSectionProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
  onAddFunds?: () => void;
}

export const RwaSection: FC<RwaSectionProps> = ({ onAddFunds }) => {
  const t = useTranslations("rwa");
  const { assets, loading, error } = useRwaAssets();

  // The table owns the full view; a row opens the detail modal, and "Trade"
  // opens the trade modal — the same modal-driven flow the Markets tab uses,
  // rather than a static side panel.
  const [detailAsset, setDetailAsset] = useState<RwaApiAsset | null>(null);
  const [tradeAsset, setTradeAsset] = useState<RwaApiAsset | null>(null);
  // Which side the trade panel opens on: the detail sheet offers Sell for an
  // asset already held.
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  // Buyable assets on the live chains (Base + Solana): issuer-only assets and
  // other catalog chains are filtered out, so every row is actionable. An asset
  // the catalog lists on both chains is kept once, on Base. Prices the backend
  // omits are filled from the CoinGecko fallback.
  const tradable = useMemo(
    // Base only: its trades are instant and fully gasless. Everything else
    // stays wired underneath — Arbitrum and Polygon are sponsored and ready,
    // Solana works end to end but rides a bridge whose latency reads as
    // broken — so widening this one chain check is all it takes to list more.
    () =>
      dedupeByChain(
        assets.filter(
          (a) => isUsableAsset(a) && isTradable(a) && isLiveChain(a) && a.chain === "base"
        )
      ),
    [assets]
  );
  const buyable = useRwaEnrichedAssets(tradable);

  const openTrade = (asset: RwaApiAsset, mode: "buy" | "sell" = "buy") => {
    setDetailAsset(null);
    setTradeMode(mode);
    setTradeAsset(asset);
  };

  // A voice buy/sell lands as URL params. Resolve the spoken symbol against the
  // loaded registry (pure derivation — no state), so the effect below only has
  // to open the modal once. `prefill` (mode/amount) is read straight at render.
  const voicePrefill = useTradePrefill();
  const prefillAsset = useMemo(() => {
    if (!voicePrefill || buyable.length === 0) return null;
    return (
      buyable.find((a) => a.symbol.toUpperCase() === voicePrefill.symbol.toUpperCase()) ?? null
    );
  }, [voicePrefill, buyable]);

  // Open the staged trade when its asset resolves. We guard on the prefill's
  // identity (a NEW object per spoken command) rather than a one-shot boolean, so
  // a SECOND voice buy/sell while the page is still mounted re-opens the panel —
  // a boolean latch blocked every trade after the first (needed a refresh).
  const openedPrefillRef = useRef<TradePrefill | null>(null);
  useEffect(() => {
    if (!prefillAsset || !voicePrefill || openedPrefillRef.current === voicePrefill) return;
    openedPrefillRef.current = voicePrefill;
    openTrade(prefillAsset);
  }, [prefillAsset, voicePrefill]);

  // The staged mode/amount only applies while the prefilled asset is the one open.
  const prefill: TradePrefill | null =
    voicePrefill && tradeAsset && prefillAsset?.id === tradeAsset.id ? voicePrefill : null;

  // One shell, two views: opening a trade from the detail sheet swaps the
  // content (contentKey change) so it slides across instead of stacking.
  const modalAsset = tradeAsset ?? detailAsset;
  const modalMode = tradeAsset ? "trade" : detailAsset ? "detail" : null;
  const closeModal = () => {
    setDetailAsset(null);
    setTradeAsset(null);
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <div className="mt-3.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="ws-display text-[26px] tracking-[-0.01em]">{t("heading")}</h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] font-normal text-white/55">
            {t("subheading")}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-white/60">
          <span className="bg-up h-1.5 w-1.5 rounded-full" />
          {t("liveRegistry")}
        </span>
      </div>

      <div className="mt-5">
        <RwaAssetList
          assets={buyable}
          selectedId={modalAsset?.id ?? ""}
          loading={loading}
          error={error}
          onOpen={setDetailAsset}
          onTrade={openTrade}
        />
      </div>

      <ModalShell
        open={modalMode !== null}
        onClose={closeModal}
        contentKey={`${modalMode}-${modalAsset?.id ?? ""}`}
      >
        {modalMode === "trade" && tradeAsset ? (
          <RwaTradePanel
            key={tradeAsset.id}
            asset={tradeAsset}
            bare
            initialMode={prefill?.mode ?? tradeMode}
            initialAmount={prefill?.amount ?? ""}
            onAddFunds={onAddFunds}
          />
        ) : modalMode === "detail" && detailAsset ? (
          <RwaDetailSheet asset={detailAsset} onTrade={openTrade} />
        ) : null}
      </ModalShell>
    </div>
  );
};
