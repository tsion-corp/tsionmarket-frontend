import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowUpRightIcon, ClockIcon, GlobeIcon } from "@/components/ui/icons";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

// A darker self-contained glass than the design's white-glass recipe: inside
// the film stage, ancestor transforms and opacities cut backdrop-filter off
// from the frame behind, so the frosting must come from the card's own
// background rather than what it samples. The moderate blur still applies
// where the browser can honour it (and in the stacked mobile mode).
const STAT_CARD =
  "w-[220px] rounded-[22px] border border-white/18 bg-[rgba(16,16,18,0.62)] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-[14px]";

const TICKER_KEYS = ["stocks", "gold", "treasuries", "trading", "predictions"] as const;

// Waypoint 1 — Hero. The full pitch: headline, subtitle, ghost CTA, two glass
// stat cards, and the market word row.
export function HeroLayer() {
  const t = useTranslations("hero");
  return (
    <CopyLayer index={1} className="items-center px-6 pt-[104px] pb-[84px] text-center">
      <RevealItem duration={1}>
        <h1 className="ws-display max-w-[min(94vw,1000px)] text-[clamp(40px,8.4vw,88px)] leading-[1.06] tracking-[-0.015em] [text-wrap:balance]">
          {t.rich("title", {
            accent: (c) => <span className="text-[#d4d4d8]">{c}</span>,
            break: () => <br />,
          })}
        </h1>
      </RevealItem>
      <RevealItem duration={1}>
        <p className="mt-[22px] max-w-[60ch] text-[clamp(15px,1.6vw,18px)] leading-[1.55] font-light text-[rgba(244,244,244,0.9)]">
          {t("subtitle")}
        </p>
      </RevealItem>
      <RevealItem duration={1} className="pointer-events-auto mt-[30px]">
        <Link
          href="/auth"
          className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-6 py-[13px] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-[50px] hover:bg-white/12"
        >
          {t("getStarted")}
          <ArrowUpRightIcon className="text-[#d4d4d8]" />
        </Link>
      </RevealItem>
      <RevealItem duration={1} className="mt-[34px] flex flex-wrap justify-center gap-3.5">
        <div className={STAT_CARD}>
          <ClockIcon size={26} />
          <div className="ws-display mt-3.5 text-[38px] leading-none tracking-[-0.02em] text-white">
            24/7
          </div>
          <div className="mt-2 text-[13px] font-normal text-white/90">{t("cardHoursLabel")}</div>
        </div>
        <div className={STAT_CARD}>
          <GlobeIcon size={26} />
          <div className="ws-display mt-3.5 text-[34px] leading-[1.05] tracking-[-0.02em] text-white">
            {t.rich("cardMarketsTitle", { break: () => <br /> })}
          </div>
          <div className="mt-2 text-[13px] font-normal text-white/90">{t("cardMarketsLabel")}</div>
        </div>
      </RevealItem>
      <RevealItem
        duration={1}
        className="mt-[38px] flex flex-wrap justify-center gap-[clamp(24px,5vw,64px)]"
      >
        {TICKER_KEYS.map((k) => (
          <span
            key={k}
            className="ws-display text-[clamp(18px,2.6vw,30px)] text-[rgba(244,244,244,0.9)]"
          >
            {t(`ticker.${k}`)}
          </span>
        ))}
      </RevealItem>
    </CopyLayer>
  );
}
