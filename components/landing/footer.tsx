import { BRAND } from "@/lib/brand";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/ui/wordmark";

// Link labels come from the landing.footer catalog; social names stay literal
// (product names are never translated).
const COLUMNS = [
  {
    titleKey: "productTitle",
    links: [
      { href: "#markets", key: "markets" },
      { href: "#naira", key: "funding" },
      { href: "#how", key: "how" },
      { href: "#early", key: "getStarted" },
    ],
  },
  {
    titleKey: "companyTitle",
    links: [
      { href: "#values", key: "security" },
      { href: "#", key: "careers" },
      { href: "#faq", key: "faq" },
    ],
  },
] as const;

const SOCIALS = [
  { href: "#", label: "X / Twitter" },
  { href: "#", label: "Telegram" },
  { href: "#", label: "Discord" },
] as const;

export function Footer() {
  const t = useTranslations("landing.footer");
  return (
    <footer className="relative z-[2] border-t border-white/8 bg-black">
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-8 px-6 pt-14 pb-9 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Wordmark href="#top" />
          <p className="mt-4 max-w-[32ch] text-sm leading-[1.6] font-normal text-white/60">
            {t("tagline")}
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.titleKey}>
            <div className="ws-display mb-3.5 text-base">{t(col.titleKey)}</div>
            <div className="flex flex-col gap-2.5 text-sm font-normal">
              {col.links.map((l) => (
                <a key={l.key} href={l.href} className="hover:text-accent text-white/60">
                  {t(l.key)}
                </a>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div className="ws-display mb-3.5 text-base">{t("connectTitle")}</div>
          <div className="flex flex-col gap-2.5 text-sm font-normal">
            {SOCIALS.map((l) => (
              <a key={l.label} href={l.href} className="hover:text-accent text-white/60">
                {l.label}
              </a>
            ))}
            <a href="#" className="hover:text-accent text-white/60">
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
