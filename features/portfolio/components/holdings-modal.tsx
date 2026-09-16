"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { SearchField } from "@/components/ui/search-field";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import { WalletIcon } from "@/components/ui/icons";
import { useMoney } from "@/components/ui/currency-select";
import {
  HoldingsViewSwitch,
  type HoldingsView,
} from "@/features/portfolio/components/holdings-view-switch";
import { MemePositions } from "@/features/portfolio/components/meme-positions";
import { TypeChip } from "@/features/portfolio/components/type-chip";
import { displayNetworkIconKey, displayNetworkLabel } from "@/features/portfolio/lib/network-label";
import {
  isDustHolding,
  isUnpricedHolding,
  memeTokenOf,
  selectHoldings,
} from "@/features/portfolio/lib/holdings";
import { usePortfolio, type TokenBalance } from "@/hooks/use-portfolio";
import { displaySymbol } from "@/lib/buy";
import { coingeckoId } from "@/lib/coingecko";
import { formatQty } from "@/lib/format";
import { isPolymarketCollateral } from "@/lib/polymarket/config";
import { canSellAsset } from "@/lib/sell";
import { tokenBg } from "@/lib/trade/assets";
import type { MemeToken } from "@/lib/meme/api";
import type { BuyPayload, DetailPayload, RwaTradePayload, SellPayload } from "@/lib/modal-types";

export interface HoldingsModalProps {
  /** Closes the shell this content sits in. */
  onClose: () => void;
  /** The asset detail sheet, which carries the Buy more and Sell actions. */
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenBuy: (buy: BuyPayload) => void;
  onOpenSell: (sell: SellPayload) => void;
  onOpenRwaTrade: (rwaTrade: RwaTradePayload) => void;
  onOpenMemeSell: (token: MemeToken) => void;
  /** Funding, offered when there is nothing to list. */
  onAddFunds: () => void;
}

// Everything that can take focus inside the dialog.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// How many placeholder rows the loading state draws. Five is the shape of a
// typical funded wallet, so the list settles rather than jumps.
const SKELETON_ROWS = [0, 1, 2, 3, 4];

// True when the wallet actually holds some of this token. Compared in base
// units: `balance` is a lossy float, and dust below its display precision would
// otherwise read as nothing held.
function hasBalance(token: TokenBalance): boolean {
  return BigInt(token.rawBalance) > 0n;
}

/**
 * What the wallet holds, one tap from the balance card's coins button. Two
 * views behind one switch: Coins, a searchable list of the assets with a
 * balance, each opening the asset sheet that already carries "Buy more" and
 * "Sell"; and Memecoins, the trade service's positions with their profit and
 * loss. The Memecoins view mounts only once it is picked, so opening the sheet
 * asks the trade service for nothing.
 *
 * Rendered as the child of a ModalShell, so it mounts only while the modal is
 * open. That matters: the card draws on the dashboard's first paint, and the
 * portfolio query below must not start there just because the card rendered.
 */
export function HoldingsModal({
  onClose,
  onOpenDetail,
  onOpenBuy,
  onOpenSell,
  onOpenRwaTrade,
  onOpenMemeSell,
  onAddFunds,
}: HoldingsModalProps) {
  const t = useTranslations("portfolio");
  const money = useMoney();
  const router = useRouter();
  const { tokens, loading, error, refetch } = usePortfolio();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<HoldingsView>("coins");

  const titleId = useId();
  const panelId = useId();
  const tabIdPrefix = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  // Cleared when a row hands the user on to another sheet: sending focus back
  // to the coins button behind that sheet would pull it off the new dialog.
  const restoreFocus = useRef(true);

  // The bought-asset set, minus anything with no balance and anything worth so
  // little it can only be shown as "<$0.01". selectHoldings drops the
  // USDC-on-Base deposit float for the same reason the holdings table does: it
  // is spendable cash, not a position the user chose to take.
  const holdings = useMemo(
    () => selectHoldings(tokens).filter((token) => hasBalance(token) && !isDustHolding(token)),
    [tokens]
  );

  // Biggest position first, which is the holdings table's own default sort.
  // Ordering only; no money is computed from these floats.
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = query
      ? holdings.filter((token) => `${token.symbol} ${token.name}`.toLowerCase().includes(query))
      : holdings;
    return [...matched].sort((a, b) => b.valueUsd - a.valueUsd);
  }, [holdings, search]);

  // A failed request with nothing cached is an error. A failed request that
  // left balances behind keeps showing them rather than blanking the list.
  const errored = !loading && error && holdings.length === 0;
  const isEmpty = !loading && !error && holdings.length === 0;

  // Escape closes, and Tab cycles inside the dialog instead of walking the page
  // behind it. The shell's own close button sits outside this content, so the
  // cycle covers the search field, the rows and the buttons this draws;
  // Escape and the backdrop remain the other two ways out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page behind a modal must not scroll under it, and focus must come back
  // to whatever opened this once it goes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Into the dialog itself, not the filter. Focusing the field raised the
    // phone keyboard over the very list the reader opened this to read, and
    // filtering is a choice they make by tapping it. The panel takes focus so
    // the trap below and the screen reader still start inside the dialog.
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (restoreFocus.current) opener?.focus();
    };
  }, []);

  // Where a held asset goes. Same routing the holdings table uses: RWAs trade
  // through the RWA panel, catalog memecoins through the meme sheet, prediction
  // collateral back to its own page, and everything else through the asset
  // sheet's Buy more / Sell pair.
  const openToken = useCallback(
    (token: TokenBalance) => {
      restoreFocus.current = false;
      onClose();

      const isRwa = token.kind === "rwa" && token.address !== null;
      // Trade-service memecoins sell through the meme sheet, on their own chain.
      const meme = memeTokenOf(token);
      // A real balance nobody could price: its value is unknown, never "$0.00".
      const unpriced = isUnpricedHolding(token);
      const isPredictionCollateral = isPolymarketCollateral(token.network, token.address);
      const sellable = canSellAsset(token.network, token.address);

      const buyAction = isPredictionCollateral
        ? () => router.push("/prediction")
        : isRwa
          ? () =>
              onOpenRwaTrade({
                network: token.network,
                address: token.address as string,
                symbol: token.symbol,
                mode: "buy",
              })
          : () =>
              onOpenBuy({
                symbol: token.symbol,
                name: token.name,
                priceUsd: token.priceUsd,
                logo: token.logo,
              });

      const sellAction = isRwa
        ? {
            cta2: t("sell", { name: token.name }),
            onCta2: () =>
              onOpenRwaTrade({
                network: token.network,
                address: token.address as string,
                symbol: token.symbol,
                mode: "sell",
              }),
          }
        : meme
          ? {
              cta2: t("sell", { name: token.name }),
              onCta2: () => onOpenMemeSell(meme),
            }
          : sellable
            ? {
                cta2: t("sell", { name: token.name }),
                onCta2: () =>
                  onOpenSell({
                    symbol: token.symbol,
                    name: token.name,
                    network: token.network,
                    address: token.address,
                    decimals: token.decimals,
                    balance: token.balance,
                    rawBalance: token.rawBalance,
                    priceUsd: token.priceUsd,
                    logo: token.logo,
                  }),
              }
            : {};

      onOpenDetail({
        sym: token.symbol,
        name: token.name,
        sub: `${formatQty(token.balance)} ${token.symbol}`,
        price: unpriced ? t("valuationUnavailable") : money.format(token.priceUsd),
        chg: "",
        bg: tokenBg(token.symbol),
        stats: [
          { k: t("holdings"), v: `${formatQty(token.balance)} ${token.symbol}` },
          { k: t("marketPrice"), v: unpriced ? "—" : money.format(token.priceUsd) },
          { k: t("network"), v: displayNetworkLabel(token) },
          {
            k: t("positionValue"),
            v: unpriced ? t("valuationUnavailable") : money.format(token.valueUsd),
          },
        ],
        cta: isPredictionCollateral ? t("managePrediction") : t("buyMore", { name: token.name }),
        onCta: buyAction,
        ...sellAction,
        coingeckoId: coingeckoId(token.symbol) ?? undefined,
        up: true,
        logo: token.logo,
      });
    },
    [money, onClose, onOpenBuy, onOpenDetail, onOpenMemeSell, onOpenRwaTrade, onOpenSell, router, t]
  );

  // A memecoin position's Sell hands on to the meme trade sheet, so this sheet
  // gets out of its way the same as a coin row does.
  const sellMemePosition = useCallback(
    (token: MemeToken) => {
      restoreFocus.current = false;
      onClose();
      onOpenMemeSell(token);
    },
    [onClose, onOpenMemeSell]
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      // Focusable so the panel itself can hold focus on open, but never a tab
      // stop of its own.
      tabIndex={-1}
      data-sensitive="balance"
    >
      <div id={titleId} className="ws-display pr-10 text-[20px]">
        {t("yourHoldings")}
      </div>

      <div className="mt-3.5">
        <HoldingsViewSwitch
          view={view}
          onChange={setView}
          labels={{
            group: t("holdingsViewsLabel"),
            coins: t("holdingsViewCoins"),
            memecoins: t("holdingsViewMemecoins"),
          }}
          panelId={panelId}
          tabIdPrefix={tabIdPrefix}
        />
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={`${tabIdPrefix}-${view}`}>
        {view === "memecoins" ? (
          <MemePositions onSell={sellMemePosition} />
        ) : (
          <>
            <div className="mt-3.5">
              <SearchField
                value={search}
                onChange={setSearch}
                label={t("searchHoldings")}
                placeholder={t("searchPlaceholder")}
              />
            </div>

            {loading ? (
              <div className="mt-3" aria-hidden="true">
                {SKELETON_ROWS.map((i) => (
                  <div key={i} className="flex items-center gap-3 border-t border-white/6 py-3.5">
                    <span className="size-9 shrink-0 animate-pulse rounded-[11px] bg-white/8" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-sans text-[14.5px] font-medium">
                        <SkeletonLine width="w-14" />
                      </span>
                      <span className="mt-0.5 block text-[12px] font-normal">
                        <SkeletonLine width="w-28" />
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-sans text-[14.5px] font-medium">
                      <SkeletonLine width="w-16" />
                    </span>
                  </div>
                ))}
              </div>
            ) : errored ? (
              <div className="mt-4 flex flex-col items-center gap-3 px-2 py-8 text-center">
                <div className="grid size-12 place-items-center rounded-2xl bg-white/6">
                  <WalletIcon size={22} />
                </div>
                <div className="ws-display text-[19px]">{t("errorTitle")}</div>
                <p className="max-w-[300px] text-[13px] leading-[1.5] font-normal text-white/55">
                  {t("errorBody")}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="text-ink mt-1 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
                >
                  {t("tryAgain")}
                </button>
              </div>
            ) : isEmpty ? (
              <div className="mt-4 flex flex-col items-center gap-3 px-2 py-8 text-center">
                <div className="grid size-12 place-items-center rounded-2xl bg-white/6">
                  <WalletIcon size={22} />
                </div>
                <div className="ws-display text-[19px]">{t("emptyTitle")}</div>
                <p className="max-w-[300px] text-[13px] leading-[1.5] font-normal text-white/55">
                  {t("emptyBody")}
                </p>
                <button
                  type="button"
                  onClick={onAddFunds}
                  className="text-ink mt-1 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
                >
                  {t("addFunds")}
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="mt-4 px-2 py-8 text-center text-[13px] font-normal text-white/45">
                {t("noSearchMatches")}
              </div>
            ) : (
              // Far more of the window than the old min(52vh,420px), and stated
              // against the chrome rather than against the viewport alone. The shell
              // caps its panel at 92vh; the title, the view switch, the search field
              // and the panel's own padding cost about 205px above and below this
              // list. Budgeting 88vh minus 215px therefore leaves the panel a little
              // slack at every height, so the list scrolls and the panel never does:
              // a second scrollbar there would carry the close button off the top.
              // 660px is the ceiling, because a list taller than that stops being
              // scannable.
              <div className="mt-3 max-h-[min(88vh_-_215px,660px)] overflow-y-auto">
                {rows.map((token) => (
                  // data-no-ripple, because the hover lift is not declared here.
                  // globals.css gives every button ws-pressable through @layer base
                  // with :where(button:not([data-no-ripple])), and that utility's
                  // hover is translateY(-2px) scale(1.02). A list of rows must not
                  // grow under the pointer, so the row opts out of the rule entirely
                  // and states its own feedback: the background alone, cross-faded by
                  // transition-colors, which now owns the transition list.
                  <button
                    key={token.symbol + token.network}
                    type="button"
                    data-no-ripple
                    onClick={() => openToken(token)}
                    className="flex w-full cursor-pointer items-center gap-3 border-t border-white/6 py-3.5 text-left transition-colors duration-150 hover:bg-white/6"
                  >
                    <span className="relative shrink-0">
                      <AssetIcon
                        sym={displaySymbol(token.symbol)}
                        bg={tokenBg(token.symbol)}
                        logo={token.logo}
                        fallback="gradient"
                      />
                      <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1.5px]">
                        <NetworkIcon network={displayNetworkIconKey(token)} size={14} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-sans text-[14.5px] font-medium">
                          {displaySymbol(token.symbol)}
                        </span>
                        <span className="shrink-0">
                          <TypeChip kind={token.kind} />
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] font-normal text-white/50">
                        {formatQty(token.balance)} · {displayNetworkLabel(token)}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-right font-sans text-[14.5px] font-medium">
                      {isUnpricedHolding(token)
                        ? t("valuationUnavailable")
                        : money.format(token.valueUsd)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
