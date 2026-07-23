"use client";

import { BalanceCard } from "@/components/dashboard/balance-card";
import { AssetIcon } from "@/components/ui/asset-icon";
import { useMoney } from "@/components/ui/currency-select";
import { Eyebrow } from "@/components/ui/eyebrow";
import { WalletIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { usePortfolio, type TokenBalance } from "@/hooks/use-portfolio";
import { coingeckoId } from "@/lib/coingecko";
import { formatQty } from "@/lib/format";
import type { ConfirmPayload, DetailPayload } from "@/components/dashboard/modal-types";

interface PortfolioViewProps {
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
  onOpenSend: () => void;
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

const NETWORK_LABELS: Record<string, string> = {
  "eth-mainnet": "Ethereum",
  "base-mainnet": "Base",
  "arb-mainnet": "Arbitrum",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

function networkLabel(network: string): string {
  return NETWORK_LABELS[network] ?? network;
}

// Stable gradient per symbol so tokens without a built-in icon stay visually
// distinct across the app.
function tokenBg(symbol: string): string {
  let hue = 0;
  for (let i = 0; i < symbol.length; i++) {
    hue = (hue * 31 + symbol.charCodeAt(i)) % 360;
  }
  return `linear-gradient(135deg, hsl(${hue} 62% 46%), hsl(${(hue + 42) % 360} 55% 32%))`;
}

const ALLOCATION_COLORS = [
  "#A78BFA",
  "#7C9CE7",
  "#7CE7B0",
  "#E7C97C",
  "#E79CC9",
  "rgba(255,255,255,0.4)",
];

interface AllocationSlice {
  name: string;
  pct: number;
  color: string;
}

function buildAllocation(tokens: TokenBalance[], totalUsd: number): AllocationSlice[] {
  if (totalUsd <= 0) return [];
  const top = tokens.slice(0, 5);
  const slices: AllocationSlice[] = top.map((t, i) => ({
    name: t.name,
    pct: (t.valueUsd / totalUsd) * 100,
    color: ALLOCATION_COLORS[i],
  }));
  const restValue = tokens.slice(5).reduce((sum, t) => sum + t.valueUsd, 0);
  if (restValue > 0) {
    slices.push({ name: "Other", pct: (restValue / totalUsd) * 100, color: ALLOCATION_COLORS[5] });
  }
  return slices;
}

export function PortfolioView({
  onOpenFunds,
  onOpenWithdraw,
  onOpenSend,
  onOpenDetail,
  onOpenConfirm,
}: PortfolioViewProps) {
  const { totalUsd, tokens, loading } = usePortfolio();
  const money = useMoney();
  const allocation = buildAllocation(tokens, totalUsd);
  const isEmpty = !loading && tokens.length === 0;

  const reviewConfirm = (t: TokenBalance): ConfirmPayload => ({
    eyebrow: "Portfolio",
    badgeSym: t.symbol,
    badgeBg: tokenBg(t.symbol),
    badgeLogo: t.logo,
    title: t.name,
    sub: `${formatQty(t.balance)} ${t.symbol} · ${networkLabel(t.network)}`,
    lines: [
      { k: "Holdings", v: `${formatQty(t.balance)} ${t.symbol}` },
      { k: "Market price", v: money.format(t.priceUsd) },
      { k: "Network", v: networkLabel(t.network) },
      { k: "Position value", v: money.format(t.valueUsd), c: "#7CE7B0" },
    ],
    cta: "Done",
    successTitle: "All set",
    successMsg: `${t.name} is up to date in your portfolio.`,
  });

  const openToken = (t: TokenBalance) =>
    onOpenDetail({
      sym: t.symbol,
      name: t.name,
      sub: `${formatQty(t.balance)} ${t.symbol}`,
      price: money.format(t.priceUsd),
      chg: "",
      bg: tokenBg(t.symbol),
      stats: [
        { k: "Holdings", v: `${formatQty(t.balance)} ${t.symbol}` },
        { k: "Market price", v: money.format(t.priceUsd) },
        { k: "Network", v: networkLabel(t.network) },
        { k: "Position value", v: money.format(t.valueUsd) },
      ],
      cta: `Trade ${t.name}`,
      onCta: () => onOpenConfirm(reviewConfirm(t)),
      coingeckoId: coingeckoId(t.symbol) ?? undefined,
      up: true,
      logo: t.logo,
    });

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Portfolio</Eyebrow>

      <div className="mt-3.5 grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.4fr_1fr]">
        <BalanceCard
          onOpenFunds={onOpenFunds}
          onOpenWithdraw={onOpenWithdraw}
          onOpenSend={onOpenSend}
        />

        <div className="ws-card flex flex-col p-5 sm:p-[26px]">
          <div className="text-[13px] font-normal text-white/60">Allocation</div>
          {loading ? (
            <div className="mt-4 flex flex-col gap-3.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[7px] animate-pulse rounded-full bg-white/8" />
              ))}
            </div>
          ) : allocation.length === 0 ? (
            <div className="grid flex-1 place-items-center py-8 text-center text-[13px] font-normal text-white/40">
              No assets to allocate yet
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3.5">
              {allocation.map((a) => (
                <div key={a.name}>
                  <div className="mb-1.5 flex justify-between text-[13.5px] font-normal">
                    <span className="truncate text-white/85">{a.name}</span>
                    <span className="tnum text-white/55">{a.pct.toFixed(1)}%</span>
                  </div>
                  <ProgressBar pct={a.pct} color={a.color} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6">
            <WalletIcon size={22} />
          </div>
          <div className="ws-serif text-[22px]">Your portfolio is empty</div>
          <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">
            Add funds to get started. Tokens across your wallets show up here automatically.
          </p>
          <button
            onClick={onOpenFunds}
            className="text-ink mt-1 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            Add funds
          </button>
        </div>
      ) : (
        <div className="ws-card mt-[18px] overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-5 pb-3.5 sm:px-6">
            <span className="ws-serif text-[22px]">Your holdings</span>
            <span className="text-[13px] font-normal text-white/50">
              {loading
                ? "Loading…"
                : `${tokens.length} ${tokens.length === 1 ? "asset" : "assets"}`}
            </span>
          </div>
          <div className="grid grid-cols-[1.7fr_auto] gap-3.5 px-4 pb-2.5 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[2fr_1fr_1fr_1fr] sm:px-6">
            <span>Asset</span>
            <span className="hidden text-right min-[560px]:block">Price</span>
            <span className="hidden text-right min-[560px]:block">Network</span>
            <span className="text-right">Value</span>
          </div>

          {loading
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-t border-white/6 px-4 py-3.5 sm:px-6"
                >
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-[11px] bg-white/8" />
                  <span className="h-4 w-32 animate-pulse rounded bg-white/8" />
                  <span className="ml-auto h-4 w-16 animate-pulse rounded bg-white/8" />
                </div>
              ))
            : tokens.map((t) => (
                <button
                  key={t.symbol + t.network}
                  onClick={() => openToken(t)}
                  className="grid w-full cursor-pointer grid-cols-[1.7fr_auto] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 text-left transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1fr] sm:px-6"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <AssetIcon sym={t.symbol} bg={tokenBg(t.symbol)} logo={t.logo} />
                    <span className="min-w-0">
                      <span className="block truncate font-sans text-[14.5px] font-medium">
                        {t.name}
                      </span>
                      <span className="block truncate text-xs font-normal text-white/50">
                        {formatQty(t.balance)} {t.symbol} · {networkLabel(t.network)}
                      </span>
                    </span>
                  </span>
                  <span className="tnum hidden text-right text-sm font-normal min-[560px]:block">
                    {money.format(t.priceUsd)}
                  </span>
                  <span className="hidden text-right text-[13px] font-normal text-white/45 min-[560px]:block">
                    {networkLabel(t.network)}
                  </span>
                  <span className="tnum text-right font-sans text-sm font-medium">
                    {money.format(t.valueUsd)}
                  </span>
                </button>
              ))}
        </div>
      )}
    </div>
  );
}
