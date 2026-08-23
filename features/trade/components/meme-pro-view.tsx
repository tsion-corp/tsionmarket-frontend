"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/ui/icons";
import { AssetChart } from "@/components/ui/asset-chart";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/features/trade/components/meme-bits";
import { MobileTradeSheet } from "@/features/trade/components/mobile-trade-sheet";
import { ListPagination } from "@/components/ui/list-pagination";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import {
  useMemeCatalog,
  useMemeSearch,
  useMemeToken,
} from "@/features/trade/hooks/use-meme-tokens";
import { useCoingeckoId } from "@/hooks/use-coingecko-id";
import { visibleWarnings, compactUsd, type MemeToken } from "@/lib/meme/api";

// The desk interface: provider-backed search (name, symbol or contract
// address), the server-paginated catalog table with liquidity/volume/mcap,
// and a detail rail with candles and the trade action.
// Coins per page, matching the other market lists.
const PER_PAGE = 6;
// The selector inside the phone's trade screen fills the whole screen, so it
// asks for far more of the catalog before the pager appears.
const PICKER_PER_PAGE = 14;

// The coin list shown inside the trade screen's selector. Its own component so
// its catalog page is only requested once the selector is actually opened —
// the sheet calls the picker's render function only while it is showing.
function CoinPicker({
  renderRow,
  onPick,
}: {
  renderRow: (row: MemeToken, onPicked: () => void) => React.ReactNode;
  onPick: (row: MemeToken) => void;
}) {
  const t = useTranslations("meme");
  const [page, setPage] = useState(1);
  const { tokens, pageCount, isLoading } = useMemeCatalog(page, PICKER_PER_PAGE);

  return (
    <div className="ws-card overflow-hidden">
      {isLoading && tokens.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] font-normal text-white/45">
          {t("loading")}
        </div>
      ) : (
        tokens.map((row) => renderRow(row, () => onPick(row)))
      )}
      <ListPagination page={page} pages={pageCount} onPage={setPage} />
    </div>
  );
}

export function MemeProView() {
  const t = useTranslations("meme");
  const [page, setPage] = useState(1);
  const { tokens, pageCount, isLoading } = useMemeCatalog(page, PER_PAGE);
  const [search, setSearch] = useState("");
  const searchState = useMemeSearch(search);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  // On a phone the coin's detail card and chart open as a screen of their own,
  // chosen from the list. Desktop keeps them in the column beside the table.
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [trading, setTrading] = useState(false);

  const rows = searchState.active ? searchState.results : tokens;
  const fallbackSelected = rows[0]?.address ?? null;
  const address = selectedAddress ?? fallbackSelected;
  const { token } = useMemeToken(address);
  const listedRow = useMemo(() => rows.find((r) => r.address === address) ?? null, [rows, address]);
  const shown = token ?? listedRow;

  // Long-tail Base tokens chart through the CoinGecko contract resolver.
  const resolved = useCoingeckoId(shown ? "base" : null, shown?.address ?? null);

  const openCoin = (addr: string) => {
    setSelectedAddress(addr);
    setSheetOpen(true);
  };

  // One row, drawn the same whether it opens a coin from the section or
  // switches to one from inside the trade screen.
  const coinRow = (row: MemeToken, onPick: () => void) => (
    <button
      key={row.address}
      onClick={onPick}
      className="flex w-full cursor-pointer items-center gap-3 border-b border-white/6 px-4 py-3.5 text-left transition-colors last:border-b-0 active:bg-white/4"
    >
      <MemeCoin token={row} size={34} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-sans text-[14.5px] font-medium">{row.symbol ?? "?"}</span>
          <RiskBadge level={row.riskLevel} />
        </span>
        <span className="block truncate text-[11.5px] font-normal text-white/45">
          {row.name ?? "—"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block font-sans text-[14px] font-medium">
          {priceLabel(row.priceUsd)}
        </span>
        <span className="block text-[12px]">
          <PctChange value={row.priceChange24hPercent} />
        </span>
      </span>
    </button>
  );

  const searchBox = (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
        <SearchIcon />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] font-normal text-white outline-none"
        />
      </div>
    </>
  );

  const table = (
    <>
      <div className="ws-card overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_90px] gap-3 px-4 py-3 text-[11px] font-normal tracking-[0.05em] text-white/40 uppercase">
            <span>{t("colToken")}</span>
            <span className="text-right">{t("colPrice")}</span>
            <span className="text-right">{t("col24h")}</span>
            <span className="text-right">{t("colLiquidity")}</span>
            <span className="text-right">{t("colVolume")}</span>
            <span />
          </div>
          {isLoading && rows.length === 0 ? (
            <div className="border-t border-white/6 px-4 py-10 text-center text-[13px] font-normal text-white/45">
              {t("loading")}
            </div>
          ) : searchState.searching ? (
            <div className="border-t border-white/6 px-4 py-10 text-center text-[13px] font-normal text-white/45">
              {t("searching")}
            </div>
          ) : rows.length === 0 ? (
            <div className="border-t border-white/6 px-4 py-10 text-center text-[13px] font-normal text-white/45">
              {searchState.active ? t("noResults") : t("empty")}
            </div>
          ) : (
            rows.map((row) => {
              const active = row.address === address;
              return (
                <div
                  key={row.address}
                  onClick={() => setSelectedAddress(row.address)}
                  className={`grid cursor-pointer grid-cols-[2fr_1fr_1fr_1fr_1fr_90px] items-center gap-3 border-t border-white/6 px-4 py-3 text-[13px] transition-colors ${
                    active ? "bg-white/6" : "hover:bg-white/4"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <MemeCoin token={row} size={26} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate font-sans text-[13.5px] font-medium">
                        {row.symbol ?? "?"}
                        <RiskBadge level={row.riskLevel} />
                      </div>
                      <div className="truncate text-[11px] font-normal text-white/45">
                        {row.name ?? "—"}
                      </div>
                    </div>
                  </div>
                  <span className="tnum text-right font-normal">{priceLabel(row.priceUsd)}</span>
                  <span className="text-right text-[12.5px]">
                    <PctChange value={row.priceChange24hPercent} />
                  </span>
                  <span className="tnum text-right text-[12.5px] font-normal text-white/60">
                    {compactUsd(row.liquidityUsd)}
                  </span>
                  <span className="tnum text-right text-[12.5px] font-normal text-white/60">
                    {compactUsd(row.volume24hUsd)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAddress(row.address);
                      setTrading(true);
                    }}
                    className="bg-up text-up-ink cursor-pointer rounded-full py-1.5 text-center font-sans text-[12px] font-bold"
                  >
                    {t("tradeAction")}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {!searchState.active ? (
          <ListPagination page={page} pages={pageCount} onPage={setPage} />
        ) : null}
      </div>
    </>
  );

  const detailPanel = (
    <>
      <div className="flex flex-col gap-4">
        {shown ? (
          <>
            <div className="ws-card p-4">
              <div className="flex items-center gap-3">
                <MemeCoin token={shown} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="ws-display truncate text-[17px]">{shown.symbol ?? "?"}</span>
                    <RiskBadge level={shown.riskLevel} />
                  </div>
                  <div className="truncate text-xs font-normal text-white/50">
                    {shown.name ?? "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[16px]">{priceLabel(shown.priceUsd)}</div>
                  <div className="text-xs">
                    <PctChange value={shown.priceChange24hPercent} />
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    [t("colLiquidity"), compactUsd(shown.liquidityUsd)],
                    [t("colVolume"), compactUsd(shown.volume24hUsd)],
                    [t("colMcap"), compactUsd(shown.marketCapUsd)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="ws-inset px-2 py-2">
                    <div className="text-[10px] font-normal tracking-[0.05em] text-white/40 uppercase">
                      {label}
                    </div>
                    <div className="tnum text-[13px] font-medium">{value}</div>
                  </div>
                ))}
              </div>
              {visibleWarnings(shown.warnings).length > 0 ? (
                <div className="mt-3 flex flex-col gap-1">
                  {visibleWarnings(shown.warnings)
                    .slice(0, 3)
                    .map((w, i) => (
                      <div
                        key={`${w.code}-${i}`}
                        className="text-down/90 text-[11.5px] font-normal"
                      >
                        {w.message}
                      </div>
                    ))}
                </div>
              ) : null}
              <button
                onClick={() => setTrading(true)}
                className="bg-up text-up-ink mt-3 w-full cursor-pointer rounded-[12px] p-3 font-sans text-[14px] font-semibold hover:opacity-90"
              >
                {t("tradeCta", { symbol: shown.symbol ?? "" })}
              </button>
            </div>

            <div className="ws-card p-4">
              {resolved.id ? (
                <AssetChart
                  coingeckoId={resolved.id}
                  allowCandles
                  defaultType="candles"
                  height={260}
                  up={Number(shown.priceChange24hPercent ?? 0) >= 0}
                />
              ) : (
                <div className="grid h-[260px] place-items-center text-center text-[13px] font-normal text-white/45">
                  {resolved.loading ? t("loading") : t("noChart")}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );

  const tradeSheet = (
    <>
      {trading && shown ? <MemeTradeSheet token={shown} onClose={() => setTrading(false)} /> : null}
    </>
  );

  // The phone view: a compact coin list. The wide table scrolls sideways at
  // this width and the detail card and chart double the section's height, so
  // the list stays here and everything else opens on tap.
  if (isMobile) {
    return (
      <>
        {searchBox}

        <div className="ws-card overflow-hidden">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] font-normal text-white/45">
              {isLoading ? t("loading") : t("noResults")}
            </div>
          ) : (
            rows.map((row) => coinRow(row, () => openCoin(row.address)))
          )}
          {!searchState.active ? (
            <ListPagination page={page} pages={pageCount} onPage={setPage} />
          ) : null}
        </div>

        <MobileTradeSheet
          open={sheetOpen && shown != null}
          onClose={() => setSheetOpen(false)}
          title={shown?.symbol ?? "—"}
          subtitle={shown?.name ?? undefined}
          marketPicker={(close) => (
            <CoinPicker
              renderRow={coinRow}
              onPick={(row) => {
                setSelectedAddress(row.address);
                close();
              }}
            />
          )}
        >
          {detailPanel}
        </MobileTradeSheet>

        {tradeSheet}
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 min-[1080px]:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        {searchBox}
        {table}
      </div>

      {detailPanel}

      {tradeSheet}
    </div>
  );
}
