import Link from "next/link";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/ui/wordmark";
import { ArkMark } from "@/components/ui/ark-mark";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { LanguageSelect } from "@/components/ui/language-select";

// Each link carries both an anchor (classic landing) and a waypoint index
// (scroll-film landing). Which one renders depends on whether onNavigate
// is provided.
const LINKS = [
  { href: "#markets", key: "markets", waypoint: 3 },
  { href: "#values", key: "security", waypoint: 2 },
  { href: "#how", key: "how", waypoint: 5 },
  { href: "#faq", key: "faq", waypoint: 7 },
] as const;

const LINK_CLASS = "hover:text-accent rounded-full px-3.5 py-2 text-sm font-medium text-white/90";

interface NavbarProps {
  // When set, the film landing owns navigation: links scroll to waypoint
  // indices instead of anchor targets. When absent, anchors work as before.
  onNavigate?: (waypoint: number) => void;
}

export function Navbar({ onNavigate }: NavbarProps) {
  const t = useTranslations("landingNav");
  return (
    <nav className="ws-glass fixed top-4 left-1/2 z-[300] flex w-[min(1120px,calc(100%-24px))] -translate-x-1/2 items-center justify-between rounded-full py-[9px] pr-2.5 pl-[18px]">
      {onNavigate ? (
        // Wordmark renders a Link, and a link inside a button is invalid
        // markup, so the film variant rebuilds the same lockup as a button.
        <button
          type="button"
          onClick={() => onNavigate(0)}
          className="flex cursor-pointer items-center gap-2 text-white"
        >
          <ArkMark height={22} />
        </button>
      ) : (
        <Wordmark />
      )}
      {/* Absolutely centered so the pill stays in the true middle of the nav
          regardless of how wide the side clusters are; justify-between alone
          drifts it toward the lighter side. */}
      <div className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-[5px] lg:flex">
        {LINKS.map((l) =>
          onNavigate ? (
            <button
              key={l.key}
              type="button"
              onClick={() => onNavigate(l.waypoint)}
              className={`${LINK_CLASS} cursor-pointer`}
            >
              {t(l.key)}
            </button>
          ) : (
            <a key={l.key} href={l.href} className={LINK_CLASS}>
              {t(l.key)}
            </a>
          )
        )}
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <LanguageSelect />
        <Link
          href="/auth"
          className="hover:text-accent hidden rounded-full px-2.5 py-[11px] text-[13px] font-medium whitespace-nowrap text-white/90 min-[400px]:block min-[400px]:px-3 min-[400px]:text-sm"
        >
          {t("login")}
        </Link>
        <Link
          href="/auth"
          className="text-ink inline-flex items-center gap-[7px] rounded-full bg-white px-3.5 py-[11px] text-[13px] font-semibold whitespace-nowrap hover:opacity-90 min-[400px]:text-sm sm:px-5"
        >
          {t("getStarted")}
          <ArrowUpRightIcon className="text-arrow hidden min-[400px]:block" />
        </Link>
      </div>
    </nav>
  );
}
