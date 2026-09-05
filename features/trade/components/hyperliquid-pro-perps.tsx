"use client";

import { useEffect, useRef, useState } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { HyperliquidAssetPicker } from "@/features/trade/components/hyperliquid-asset-picker";
import { HyperliquidMarketHeader } from "@/features/trade/components/hyperliquid-market-header";
import { HyperliquidChartPanel } from "@/features/trade/components/hyperliquid-chart-panel";
import { HyperliquidMarketPanel } from "@/features/trade/components/hyperliquid-market-panel";
import { HyperliquidOrderForm } from "@/features/trade/components/hyperliquid-order-form";
import { HyperliquidPositionsList } from "@/features/trade/components/hyperliquid-positions-list";
import { HyperliquidOrdersList } from "@/features/trade/components/hyperliquid-orders-list";
import { useHyperliquidTrading } from "@/features/trade/hooks/use-hyperliquid-trading";
import { useHyperliquidMarketContexts } from "@/features/trade/hooks/use-hyperliquid-market-contexts";
import {
  isRestingOrder,
  type HlOrderRow,
  type HlPositionView,
  type HlTriggerKind,
} from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidProPerpsProps {
  /** Deep-links to a specific market on mount, e.g. from /trade/:symbol. */
  initialSymbol?: string;
}

// Full control: searchable market picker, chart, limit/TP/SL entry, leverage,
// positions and orders. See apps/perp's README for the backend side and
// apps/perp/src/signing/README.md for the signing model — every write below
// is signed by the user's own embedded wallet, never this backend.
export function HyperliquidProPerps({ initialSymbol = "" }: HyperliquidProPerpsProps) {
  const trading = useHyperliquidTrading();
  const { contexts } = useHyperliquidMarketContexts(trading.authenticated);
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
  const [busy, setBusy] = useState(false);
  const portfolio = usePortfolio();

  // The three-panel row's height is set ONCE, here, on the grid itself — not
  // derived from any panel's own content. Each panel then fills that row
  // (h-full) and scrolls its own content internally, so no panel's natural
  // size can push the others around, and nothing overflows the viewport.
  //
  // The height is "however much viewport is left below this grid" — measured
  // via getBoundingClientRect().top rather than hand-maintained CSS tokens
  // for the header/stat-strip/padding above it, because those tokens would
  // just be guessed pixel values with no way to verify them without a
  // browser, and they silently go stale the moment any of that chrome
  // changes. Measuring the real offset can't drift out of sync — it's asking
  // the DOM directly, not reproducing what the DOM already knows.
  //
  // Only engaged at the min-[1400px] breakpoint where the grid actually goes
  // three-column (see className below) — below that everything stacks and
  // should scroll as a normal page, not lock to viewport height.
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState<number | undefined>(undefined);
  const BOTTOM_BREATHING_ROOM_PX = 24;

  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const recalc = () => {
      if (window.innerWidth < 1400) {
        setRowHeight(undefined);
        return;
      }
      const top = node.getBoundingClientRect().top;
      setRowHeight(Math.max(320, window.innerHeight - top - BOTTOM_BREATHING_ROOM_PX));
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  // The compact market picker's search dropdown matches the chart column's
  // real rendered width, so it doesn't look like an undersized popover next
  // to a much wider chart. Same measured-not-guessed approach as rowHeight.
  const chartColumnRef = useRef<HTMLDivElement>(null);
  const [chartColumnWidth, setChartColumnWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const node = chartColumnRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setChartColumnWidth(Math.round(width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A top-up or withdrawal moves the user's main (spot) balance too — refresh
  // it the moment the perps side confirms, instead of leaving it to catch up
  // on its own ~20s poll. The perps-side settlement itself (Hyperliquid's own
  // confirmation window, then the on-chain leg back to the main wallet) is
  // real transfer time that can't be sped up; this just removes the extra,
  // avoidable lag on top of it.
  const handleWalletChanged = () => {
    trading.refetchAll();
    void portfolio.refetchFresh();
  };

  if (!trading.authenticated) {
    return (
      <div className="ws-card p-6 text-sm font-normal text-white/55">Sign in to trade perps.</div>
    );
  }

  // Default to BTC-USDC before the user has picked anything — assets sort
  // alphabetically from the backend, so falling back to assets[0] directly
  // would land on whatever sorts first (e.g. a native ticker like "0G"),
  // not the market a new user actually expects to see first.
  const asset =
    trading.assets.find((a) => a.symbol === selectedSymbol) ??
    trading.assets.find((a) => a.symbol === "BTC") ??
    trading.assets[0] ??
    null;
  const markPrice = asset ? Number(trading.prices[asset.symbol] ?? 0) : 0;
  const currentPosition = asset
    ? (trading.positions.find((p) => p.assetId === asset.id && p.status === "open") ?? null)
    : null;

  const withBusy = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };

  // `finally`, not a trailing call after `await` — a rejected action (e.g.
  // "already filled or cancelled") still means Hyperliquid's own state moved
  // since we last fetched it. Refetching only on success left a failed
  // cancel/close/edit showing the exact same stale, still-actionable row
  // forever — nothing was actually duplicated, the UI just never learned
  // the order/position had already resolved.
  const handleClosePosition = (position: HlPositionView, siblingOrderIdsToCancel: string[]) =>
    withBusy(async () => {
      try {
        await trading.actions.closePosition(position.id, siblingOrderIdsToCancel);
      } finally {
        trading.refetchAll();
        // The immediate refetch above usually already shows the close (a
        // reduce-only IOC fills almost instantly), but Hyperliquid can lag
        // behind that by a couple of seconds — this keeps polling in the
        // background (not blocking the busy state) so a still-stale
        // position, or a sibling TP/SL still shown as resting after being
        // cancelled, self-corrects within a few seconds instead of sitting
        // there until the next unrelated refetch.
        void trading.waitForPositionsChange((rows) => rows.every((p) => p.id !== position.id));
        if (siblingOrderIdsToCancel.length > 0) {
          void trading.waitForOrdersChange((rows) =>
            rows
              .filter((o) => siblingOrderIdsToCancel.includes(o.id))
              .every((o) => !isRestingOrder(o))
          );
        }
      }
    });

  const handleEditTrigger = (
    position: HlPositionView,
    kind: HlTriggerKind,
    triggerPrice: string,
    existingOrderId: string | undefined
  ) =>
    withBusy(async () => {
      try {
        await trading.actions.updateTriggerOrder(position.id, kind, triggerPrice, existingOrderId);
      } finally {
        trading.refetchAll();
      }
    });

  const handleCancelOrder = (order: HlOrderRow) =>
    withBusy(async () => {
      try {
        await trading.actions.cancelOrder(order.id);
      } finally {
        trading.refetchAll();
      }
    });

  return (
    <div className="flex flex-col gap-4" data-sensitive="position">
      <HyperliquidMarketHeader
        symbol={asset?.symbol ?? ""}
        fallbackMarkPrice={markPrice}
        assetPicker={
          <HyperliquidAssetPicker
            assets={trading.assets}
            prices={trading.prices}
            contexts={contexts}
            selected={asset?.symbol ?? ""}
            onSelect={setSelectedSymbol}
            loading={trading.assetsLoading}
            compact
            dropdownWidth={chartColumnWidth}
          />
        }
      />

      {/* One three-column row: chart, order book/trades, order ticket — all
          three fill the SAME row height (rowHeight, computed above) and
          scroll their own content internally rather than growing the row.
          min-h-0 on the grid and every column is load-bearing: grid/flex
          items default to min-height:auto, which refuses to shrink below
          content size — that default is what let a panel's content dictate
          the row's height in every earlier version of this layout. Below
          1400px everything stacks and scrolls as a normal page instead
          (rowHeight is unset there — see the effect above). */}
      <div
        ref={gridRef}
        style={rowHeight ? { height: rowHeight } : undefined}
        className="grid min-h-0 grid-cols-1 gap-4 min-[1400px]:grid-cols-[minmax(0,1fr)_300px_420px]"
      >
        <div ref={chartColumnRef} className="min-h-0">
          <HyperliquidChartPanel
            assetSymbol={asset?.symbol ?? ""}
            assetCategory={asset?.category}
            height={rowHeight}
          />
        </div>
        <div className="min-h-0">
          <HyperliquidMarketPanel symbol={asset?.symbol ?? ""} height={rowHeight} />
        </div>
        <div className="min-h-0">
          <HyperliquidOrderForm
            height={rowHeight}
            assetSymbol={asset?.symbol ?? ""}
            maxLeverage={asset?.maxLeverage ?? 20}
            markPrice={markPrice}
            szDecimals={asset?.szDecimals ?? 4}
            availableMarginUsdc={
              trading.clearinghouse ? Number(trading.clearinghouse.withdrawable) : 0
            }
            currentPosition={currentPosition}
            walletId={trading.walletId}
            clearinghouse={trading.clearinghouse}
            walletReady={!trading.assetsLoading && trading.walletId != null}
            busy={busy}
            onSubmit={(input, onStatus) =>
              withBusy(async () => {
                // Snapshot before the order so the background poll below can
                // tell "the fill landed" (a new position, or an existing one
                // grown) from stale data — without it, the panel showed the
                // new trade only on the next unrelated refetch.
                const before = JSON.stringify(trading.positions.map((p) => [p.id, p.size]).sort());
                const result = await trading.actions.placeOrder(input, onStatus);
                trading.refetchAll();
                void trading.waitForPositionsChange(
                  (rows) => JSON.stringify(rows.map((p) => [p.id, p.size]).sort()) !== before
                );
                return result;
              })
            }
            onUpdateLeverage={(assetSymbol, leverage, marginMode) =>
              withBusy(() => trading.actions.updateLeverage(assetSymbol, leverage, marginMode))
            }
            onBridge={() => withBusy(() => trading.actions.bridge())}
            onWithdraw={(amountUsdc, onStatus) =>
              withBusy(() => trading.actions.withdraw(amountUsdc, onStatus))
            }
            onFunded={handleWalletChanged}
          />
        </div>
      </div>

      {/* Positions/orders, full width below — matches Hyperliquid's own
          layout, where the bottom panel spans the whole terminal rather
          than being squeezed under just the chart column. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <HyperliquidPositionsList
          positions={trading.positions}
          orders={trading.orders}
          loading={trading.positionsLoading}
          busy={busy}
          walletId={trading.walletId}
          onClosePosition={handleClosePosition}
          onEditTrigger={handleEditTrigger}
        />
        <HyperliquidOrdersList
          orders={trading.orders}
          loading={trading.ordersLoading}
          busy={busy}
          onCancel={handleCancelOrder}
        />
      </div>
    </div>
  );
}
