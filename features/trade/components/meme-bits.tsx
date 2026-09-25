"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { signedPercent } from "@/features/trade/components/meme-gamified-bits";
import { subscriptZeros } from "@/lib/format";
import { compactPercentPoints } from "@/lib/meme/format";
import { tokenBg } from "@/lib/trade/assets";
import {
  visibleWarnings,
  type MemeToken,
  type TokenRiskLevel,
  type TokenWarning,
} from "@/lib/meme/api";

const RISK_STYLE: Record<TokenRiskLevel, string> = {
  LOW: "bg-up/14 text-up border-up/30",
  MEDIUM: "bg-white/8 text-white/70 border-white/15",
  HIGH: "bg-down/12 text-down border-down/30",
  CRITICAL: "bg-down/20 text-down border-down/45",
  UNKNOWN: "bg-white/6 text-white/45 border-white/12",
};

export function RiskBadge({ level }: { level: TokenRiskLevel | null | undefined }) {
  const t = useTranslations("meme");
  // The client maps every token through lib/meme/parse.ts, which fills a
  // missing level, but a token can still reach this badge from another path
  // (a holding, a fixture): treat missing or unrecognized values as UNKNOWN
  // instead of crashing the whole list.
  const resolved: TokenRiskLevel = level && level in RISK_STYLE ? level : "UNKNOWN";
  return (
    // shrink-0 keeps it inside the card when the price beside it is long, and
    // nowrap stops "LOW RISK" breaking onto a second line, which made those
    // cards taller than the rest of their row.
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.06em] whitespace-nowrap uppercase ${RISK_STYLE[resolved]}`}
    >
      {t(`risk${resolved.charAt(0)}${resolved.slice(1).toLowerCase()}`)}
    </span>
  );
}

/**
 * A signed change as every memecoin surface draws it: the compact figure on
 * screen, the full one for a screen reader when the two differ.
 *
 * The change column is 110px wide on the desk and narrower on a phone, and a
 * first day's "+12345.67%" runs straight out of it, so the visible text is
 * `compactPercentPoints` ("+12.35K%"), the same helper the Trending cards use.
 * Below a thousand points nothing is dropped and there is one node to read,
 * which is why the sr-only twin only appears when something was compacted.
 */
export function PctChange({ value }: { value: string | null }) {
  const shown = compactPercentPoints(value);
  if (shown === null) return <span className="text-white/40">—</span>;
  const full = signedPercent(value);
  const compacted = full !== null && full !== shown;
  return (
    <span className={`tnum ${shown.startsWith("-") ? "text-down" : "text-up"}`}>
      {compacted ? (
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="sr-only">{full}</span>
        </>
      ) : (
        shown
      )}
    </span>
  );
}

// The contract: a null liquidityUsd is "unknown liquidity", not low liquidity
// and not zero. A neutral line, shown beside the warnings, with the quote left
// to decide whether an executable route exists.
export function LiquidityUnknownNote({ className = "" }: { className?: string }) {
  const t = useTranslations("meme");
  return (
    <p className={`text-[11.5px] font-normal text-white/55 ${className}`}>
      {t("liquidityUnknown")}
    </p>
  );
}

// The service's automated warnings as a trade surface lists them. Codes can
// repeat or arrive empty, so the key needs the index.
export function MemeWarningList({
  warnings,
  limit,
  className = "",
}: {
  warnings: TokenWarning[];
  limit?: number;
  className?: string;
}) {
  if (warnings.length === 0) return null;
  const shown = limit === undefined ? warnings : warnings.slice(0, limit);
  return (
    <ul className={`flex flex-col gap-1 ${className}`}>
      {shown.map((w, i) => (
        <li key={`${w.code}-${i}`} className="text-down/90 text-[11.5px] font-normal">
          {w.message}
        </li>
      ))}
    </ul>
  );
}

// What every ticket tells a trader before an amount goes out, the way the trade
// sheet does: the risk level, the warnings worth showing (visibleWarnings drops
// the upgradeable-proxy line, a recorded maintainer deviation), and the neutral
// unknown-liquidity line when the service published no liquidity.
export function MemeRiskSummary({
  token,
  className = "",
}: {
  token: MemeToken;
  className?: string;
}) {
  const t = useTranslations("meme");
  return (
    <div data-region="meme-risk" className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-[12px] font-normal text-white/55">
        <span>{t("colRisk")}</span>
        <RiskBadge level={token.riskLevel} />
      </div>
      <MemeWarningList warnings={visibleWarnings(token.warnings)} limit={3} />
      {token.liquidityUsd === null ? <LiquidityUnknownNote /> : null}
    </div>
  );
}

// A quote past its expiresAt is no price at all. Said once, with the way to a
// fresh one, on every surface that blanks it.
export function QuoteExpiredNote({
  onRetry,
  className = "",
}: {
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("meme");
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="text-[12.5px] font-normal text-white/60">{t("quoteExpired")}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 cursor-pointer rounded-full border border-white/15 px-3 font-sans text-[12px] font-semibold text-white/80 hover:border-white/35 hover:text-white"
        >
          {t("retry")}
        </button>
      ) : null}
    </div>
  );
}

export function MemeCoin({ token, size = 30 }: { token: MemeToken; size?: number }) {
  const sym = token.symbol ?? "?";
  return (
    <AssetIcon sym={sym} bg={tokenBg(sym)} logo={token.logoUrl} size={size} fallback="gradient" />
  );
}

export function priceLabel(priceUsd: string | null): string {
  const n = priceUsd === null ? NaN : Number(priceUsd);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  // Below a thousandth, spelling out the zeros runs to fourteen characters and
  // shoves the risk badge out of the card, so the run is counted instead.
  const compact = subscriptZeros(n);
  if (compact) return `$${compact}`;
  return `$${n.toLocaleString("en-US", { maximumSignificantDigits: 4 })}`;
}
