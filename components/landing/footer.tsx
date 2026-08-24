import { BRAND } from "@/lib/brand";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/ui/wordmark";

// Link labels come from the landing.footer catalog; social names stay literal
// (product names are never translated). A link with a waypoint index scrolls
// the film landing when onNavigate is provided; links without one (careers)
// always stay plain anchors.
const COLUMNS = [
  {
    titleKey: "productTitle",
    links: [
      { href: "#markets", key: "markets", waypoint: 3 },
      { href: "#naira", key: "funding", waypoint: 4 },
      { href: "#how", key: "how", waypoint: 5 },
      { href: "#early", key: "getStarted", waypoint: 8 },
    ],
  },
  {
    titleKey: "companyTitle",
    links: [
      { href: "#values", key: "security", waypoint: 2 },
      { href: "#", key: "careers" },
      { href: "#faq", key: "faq", waypoint: 7 },
    ],
  },
] as const;

const SOCIALS = [
  { href: "https://x.com/TsionArk", label: "X / Twitter" },
  { href: "#", label: "Telegram" },
  { href: "#", label: "Discord" },
] as const;

interface FooterProps {
  // When set, the film landing owns navigation: waypoint links scroll to
  // waypoint indices instead of anchor targets. When absent, anchors work
  // as before.
  onNavigate?: (waypoint: number) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const t = useTranslations("landing.footer");
  const tJourney = useTranslations("landing.journey");
  return (
    <footer className="relative z-[2] border-t border-white/8 bg-black">
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-8 px-6 pt-14 pb-9 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Wordmark href="#top" />
          <p className="mt-4 max-w-[32ch] text-sm leading-[1.6] font-normal text-white/60">
            {t("tagline")}
          </p>
          <p className="mt-3.5 text-[11px] font-normal tracking-[0.2em] text-[#7a7a7a] uppercase">
            {tJourney("poweredBy", { name: "Tsion" })}
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.titleKey}>
            <div className="ws-display mb-3.5 text-base">{t(col.titleKey)}</div>
            <div className="flex flex-col gap-2.5 text-sm font-normal">
              {col.links.map((l) =>
                onNavigate && "waypoint" in l ? (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => onNavigate(l.waypoint)}
                    className="hover:text-accent cursor-pointer text-left text-white/60"
                  >
                    {t(l.key)}
                  </button>
                ) : (
                  <a key={l.key} href={l.href} className="hover:text-accent text-white/60">
                    {t(l.key)}
                  </a>
                )
              )}
            </div>
          </div>
        ))}
        <div>
          <div className="ws-display mb-3.5 text-base">{t("connectTitle")}</div>
          <div className="flex flex-col gap-2.5 text-sm font-normal">
            {SOCIALS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.href === "#" ? undefined : "_blank"}
                rel={l.href === "#" ? undefined : "noopener noreferrer"}
                className="hover:text-accent text-white/60"
              >
                {l.label}
              </a>
            ))}
            {/* Rings the support line: 09035725241. */}
            <a href="tel:+2349035725241" className="hover:text-accent text-white/60">
              {t("contact")}
            </a>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-3 border-t border-white/6 px-6 pt-[22px] pb-10">
        <span className="text-[13px] font-normal text-white/40">
          {t("rights", { brand: BRAND })}
        </span>
        <span className="max-w-[60ch] text-right text-xs font-normal text-white/35">
          {t("disclaimer")}
        </span>
      </div>
    </footer>
  );
}
