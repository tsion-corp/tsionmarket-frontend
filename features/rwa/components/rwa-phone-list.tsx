"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ListPagination } from "@/components/ui/list-pagination";
import { SearchField } from "@/components/ui/search-field";
import { useFitRows } from "@/hooks/use-fit-rows";
import { usePaged } from "@/hooks/use-paged";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import { RwaTicket } from "@/features/rwa/components/rwa-ticket";
import { assetPriceUsd, rwaLogoUrl } from "@/features/rwa/lib/api";
import { formatChange, gradientFor, type RwaAssetView } from "@/features/rwa/lib/presenter";
import { formatUsd } from "@/lib/trade/math";
import type { TradePrefill } from "@/lib/voice/intent";

interface RwaPhoneListProps {
  assets: RwaAssetView[];
  loading: boolean;
  error: boolean;
  // Raised to the route's modal host, which owns Add funds. The ticket has no
  // access to it, so it travels through here.
  onAddFunds?: () => void;
  /**
   * A spoken "buy $10 of Ondo", already read off the URL by the section above.
   * The symbol is resolved here rather than there because this is where the
   * ticket lives: whatever opens it, opens it the same way.
   */
  prefill?: TradePrefill | null;
}

// The Real assets tab of the phone Market page: the same list the Memecoins
// tab draws, one row per asset, with the logo, the ticker and the issuer's
// name on the left and the price and the day's move on the right. A tap swaps
// the list for the asset's order ticket in place, which is what the Spot tab
// does. Rows fill the phone: as many as the list's box holds, then the shared
// foot pager walks the rest.
//
// The search field belongs to this tab rather than to the Market page, so each
// tab keeps its own query instead of one box resetting every list at once.
export function RwaPhoneList({ assets, loading, error, onAddFunds, prefill }: RwaPhoneListProps) {
  const t = useTranslations("rwa");
  const tCommon = useTranslations("common");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inQuery = q
      ? assets.filter((a) =>
          `${a.symbol} ${a.name} ${a.issuer} ${a.chain}`.toLowerCase().includes(q)
        )
      : assets;
    // Base first, as the desk lists them: it is where a buy is funded from.
    return [...inQuery].sort((a, b) => Number(b.chain === "base") - Number(a.chain === "base"));
  }, [assets, query]);

  // The tapped asset is held by id rather than by object, and looked back up on
  // every render. The 60 second price poll re-enriches the catalogue into fresh
  // objects, so holding the object would leave the ticket pointed at a stale
  // copy the moment a price ticked.
  const [ticketAssetId, setTicketAssetId] = useState<string | null>(null);
  const ticketAsset = useMemo(
    () => (ticketAssetId ? (assets.find((a) => a.id === ticketAssetId) ?? null) : null),
    [assets, ticketAssetId]
  );

  // The list is hidden rather than unmounted, and its scroll offset is put back
  // by hand on the way out: `hidden` takes the element out of layout, which
  // drops the offset the browser was holding. Someone eighty rows down comes
  // back to where they were, not to the top.
  const listRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);

  const openTicket = useCallback((asset: RwaAssetView) => {
    listScrollTop.current = listRef.current?.scrollTop ?? 0;
    setTicketAssetId(asset.id);
  }, []);

  const closeTicket = useCallback(() => setTicketAssetId(null), []);

  useLayoutEffect(() => {
    if (ticketAsset === null && listRef.current) {
      listRef.current.scrollTop = listScrollTop.current;
    }
  }, [ticketAsset]);

  const prefillAsset = useMemo(() => {
    if (!prefill) return null;
    return assets.find((a) => a.symbol.toUpperCase() === prefill.symbol.toUpperCase()) ?? null;
  }, [assets, prefill]);

  // Open the spoken asset's ticket once its asset resolves. We guard on the
  // prefill's identity (a NEW object per spoken command) rather than a one-shot
  // boolean, so a SECOND voice buy/sell while the page is still mounted
  // re-opens the ticket. A boolean latch blocked every trade after the first,
  // which needed a refresh to clear.
  const openedPrefillRef = useRef<TradePrefill | null>(null);
  useEffect(() => {
    if (!prefill || !prefillAsset || openedPrefillRef.current === prefill) return;
    openedPrefillRef.current = prefill;
    openTicket(prefillAsset);
  }, [prefill, prefillAsset, openTicket]);

  // The spoken leg and figure only apply while the asset they named is the one
  // open. Tapping a different row afterwards opens an empty ticket, rather than
  // carrying a figure meant for another asset into it.
  const stagedPrefill =
    prefill && ticketAsset && prefillAsset?.id === ticketAsset.id ? prefill : null;

  // The box is only measurable while the list is shown: a hidden box has no
  // height, so the count would collapse to the fallback if this kept measuring
  // behind an open ticket.
  const pageSize = useFitRows(listRef, ticketAsset === null);
  const paged = usePaged(rows, pageSize);
  const logos = useTokenLogos(paged.pageItems.map((a) => ({ chain: a.chain, address: a.address })));

  let body: ReactNode;
  if (loading && assets.length === 0) {
    body = [0, 1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex h-[60px] items-center gap-3 px-1">
        <span className="size-9 shrink-0 animate-pulse rounded-full bg-white/8" />
        <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
      </div>
    ));
  } else if (error && assets.length === 0) {
    body = (
      <p className="mt-8 text-center text-[13px] font-normal text-white/45">
        {t("registryUnavailable")}
      </p>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="mt-8 text-center text-[13px] font-normal text-white/45">
        {query.trim() ? t("noSearchMatches") : t("noCategoryAssets")}
      </p>
    );
  } else {
    body = (
      <>
        {paged.pageItems.map((asset) => {
          const price = assetPriceUsd(asset);
          const change = formatChange(asset.market?.change24h);
          const up = (asset.market?.change24h ?? 0) >= 0;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => openTicket(asset)}
              data-sensitive="position"
              className="flex h-[60px] w-full items-center gap-3 border-b border-white/6 px-1 text-left transition-colors active:bg-white/5"
            >
              <span className="shrink-0">
                <AssetIcon
                  sym={asset.symbol}
                  bg={gradientFor(asset.symbol)}
                  size={36}
                  logo={logos[tokenLogoKey(asset.chain, asset.address)] ?? rwaLogoUrl(asset)}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-[14px] font-semibold text-white">
                  {asset.symbol}
                </span>
                <span className="block truncate text-[11.5px] font-normal text-white/50">
                  {asset.name}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tnum block font-serif text-[13.5px] font-semibold text-white">
                  {price != null ? formatUsd(price) : "—"}
                </span>
                <span
                  className={`tnum block text-[12px] font-semibold ${
                    change ? (up ? "text-up" : "text-down") : "text-white/30"
                  }`}
                >
                  {change ?? "—"}
                </span>
              </span>
            </button>
          );
        })}
        <p aria-live="polite" className="sr-only">
          {tCommon("pageOf", { page: paged.page + 1, pages: paged.pageCount })}
        </p>
        <ListPagination
          page={paged.page + 1}
          pages={paged.pageCount}
          onPage={(target) => (target > paged.page + 1 ? paged.goNext() : paged.goPrev())}
        />
      </>
    );
  }

  return (
    <>
      {/* The ticket takes the list's place in its own scroll box, above the
          hidden list, exactly as the Spot tab stacks the two. The pill's caret
          is the way back to the list, since the list is this surface's only
          asset picker. */}
      {ticketAsset ? (
        <div className="min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden">
          {/* Keyed by asset so a different row opens a fresh ticket rather than
              reusing the open one's entered amount and staged leg. */}
          <RwaTicket
            key={ticketAsset.id}
            asset={ticketAsset}
            onAddFunds={onAddFunds}
            onChangeAsset={closeTicket}
            initialSide={stagedPrefill?.mode}
            initialAmount={stagedPrefill?.amount}
          />
        </div>
      ) : null}
      <div
        ref={listRef}
        data-testid="rwa-market-list"
        hidden={ticketAsset !== null}
        className="-mx-1 mt-2 min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden"
      >
        {/*
          Inside the scroll box, not pinned above it, so the field scrolls away
          with the rows. `mx-1` cancels the box's `-mx-1` bleed so the field's
          edges sit flush with the row content rather than 4px proud each side.
        */}
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          className="mx-1 mb-2 w-auto"
        />
        {body}
      </div>
    </>
  );
}
