import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

// Waypoint 7 — FAQ. Header plus the interactive accordion, which needs its
// own pointer-events wrapper because the copy stage disables hit-testing.
export function FaqLayer() {
  const t = useTranslations("landing.faq");
  return (
    <CopyLayer index={7} anchorId="faq" className="px-6 pt-[104px] pb-[72px]">
      <div className="mx-auto w-full max-w-[820px]">
        <RevealItem className="mb-7 text-center">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mt-3.5 text-[clamp(32px,4.4vw,54px)] tracking-[-0.03em]">
            {t("title")}
          </h2>
        </RevealItem>
        <RevealItem className="pointer-events-auto">
          <FaqAccordion />
        </RevealItem>
      </div>
    </CopyLayer>
  );
}
