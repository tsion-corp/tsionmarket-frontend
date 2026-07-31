import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  ChartBarsIcon,
  CollectiblesIcon,
  FlagIcon,
  GameArrowsIcon,
  TrendIcon,
  YieldIcon,
} from "@/components/ui/icons";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

const CARD =
  "rounded-[24px] border border-white/18 bg-[rgba(16,16,18,0.62)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-[14px]";
const PILL =
  "rounded-full border border-white/12 bg-white/7 px-[11px] py-[5px] text-[12px] font-normal text-white/90";
const TILE = "grid h-11 w-11 place-items-center rounded-xl border";
const TILE_ACCENT = `${TILE} border-[rgba(212,212,216,0.2)] bg-[rgba(212,212,216,0.12)] text-[#d4d4d8]`;
const TILE_PLAIN = `${TILE} border-white/12 bg-white/6 text-white`;
const BODY = "leading-[1.55] font-light text-[rgba(244,244,244,0.82)]";

// Waypoint 3 — Markets bento. Every market segment on one board; the grid
// collapses to a single column under 880px in CSS alone.
export function BentoLayer() {
  const t = useTranslations("landing.bento");
  const soon = (
    <span className="font-sans text-[12px] font-normal text-white/55">· {t("soon")}</span>
  );
  return (
    <CopyLayer index={3} anchorId="markets" className="px-6 pt-[92px] pb-11">
      <div className="mx-auto w-full max-w-[1120px]">
        <RevealItem className="mb-[18px] max-w-[40ch]">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mt-3.5 text-[clamp(32px,4.6vw,58px)] leading-[1.02] tracking-[-0.03em]">
            {t("title")}
          </h2>
        </RevealItem>
        <div className="grid grid-cols-1 gap-3 min-[880px]:grid-cols-6">
          <RevealItem className={`${CARD} relative overflow-hidden min-[880px]:col-span-4`}>
            <div className="absolute top-[22px] right-6 flex flex-wrap justify-end gap-1.5">
              <span className={PILL}>{t("chipFractional")}</span>
              <span className={PILL}>24/7</span>
              <span className={PILL}>{t("chipNoMin")}</span>
            </div>
            <span className={TILE_ACCENT}>
              <ChartBarsIcon size={22} />
            </span>
            <h3 className="ws-display mt-[34px] max-w-[20ch] text-[clamp(22px,2.6vw,32px)] leading-[1.04] tracking-[-0.02em]">
              {t("stocksTitle")}
            </h3>
            <p className={`mt-3 max-w-[44ch] text-[15px] ${BODY}`}>{t("stocksBody")}</p>
          </RevealItem>
          <RevealItem className={`${CARD} flex flex-col min-[880px]:col-span-2`}>
            <span className={TILE_ACCENT}>
              <TrendIcon size={22} />
            </span>
            <div className="mt-auto pt-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className={PILL}>{t("chipLeverage")}</span>
                <span className={PILL}>{t("chipAdvanced")}</span>
                <span className={PILL}>{t("chipRisk")}</span>
              </div>
              <h3 className="ws-display text-[26px] leading-[1.04] tracking-[-0.02em]">
                {t("levTitle")}
              </h3>
              <p className={`mt-2.5 text-[14.5px] ${BODY}`}>{t("levBody")}</p>
            </div>
          </RevealItem>
          <RevealItem className={`${CARD} flex flex-col min-[880px]:col-span-3`}>
            <span className={TILE_ACCENT}>
              <FlagIcon size={22} />
            </span>
            <div className="mt-auto pt-4">
              <h3 className="ws-display text-[26px] leading-[1.04] tracking-[-0.02em]">
                {t("eventsTitle")}
              </h3>
              <p className={`mt-2.5 max-w-[40ch] text-[14.5px] ${BODY}`}>{t("eventsBody")}</p>
            </div>
          </RevealItem>
          <RevealItem className={`${CARD} flex flex-col min-[880px]:col-span-3`}>
            <span className={TILE_ACCENT}>
              <GameArrowsIcon size={22} />
            </span>
            <div className="mt-auto pt-4">
              <h3 className="ws-display text-[26px] leading-[1.04] tracking-[-0.02em]">
                {t("gamesTitle")}
              </h3>
              <p className={`mt-2.5 text-[14.5px] ${BODY}`}>{t("gamesBody")}</p>
            </div>
          </RevealItem>
          <RevealItem className={`${CARD} flex flex-col min-[880px]:col-span-3`}>
            <span className={TILE_PLAIN}>
              <YieldIcon size={22} />
            </span>
            <div className="mt-auto pt-4">
              <h3 className="ws-display text-[24px] leading-[1.04] tracking-[-0.02em]">
                {t("earnTitle")} {soon}
              </h3>
              <p className={`mt-2.5 text-[14.5px] ${BODY}`}>{t("earnBody")}</p>
            </div>
          </RevealItem>
          <RevealItem className={`${CARD} flex flex-col min-[880px]:col-span-3`}>
            <span className={TILE_PLAIN}>
              <CollectiblesIcon size={22} />
            </span>
            <div className="mt-auto pt-4">
              <h3 className="ws-display text-[24px] leading-[1.04] tracking-[-0.02em]">
                {t("nftTitle")} {soon}
              </h3>
              <p className={`mt-2.5 text-[14.5px] ${BODY}`}>{t("nftBody")}</p>
            </div>
          </RevealItem>
        </div>
      </div>
    </CopyLayer>
  );
}
