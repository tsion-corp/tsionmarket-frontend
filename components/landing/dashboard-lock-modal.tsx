import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArkMark } from "@/components/ui/ark-mark";
import { BRAND, SUPPORT_EMAIL } from "@/lib/brand";

// What a visitor sees on any page but the landing page while the dashboard is
// locked (lib/dashboard-lock.ts): a cover over the whole viewport saying the
// platform is under maintenance, with the way back to the landing page.
//
// A server component with no providers beyond translations, for the same
// reason as the maintenance page: the app behind it is assumed unavailable.
export function DashboardLockModal() {
  const t = useTranslations("dashboardLock");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-lock-title"
      aria-describedby="dashboard-lock-body"
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black px-4 py-10"
    >
      {/* The film's opening frame, the same still the maintenance page uses. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/film/w0-still.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-40 blur-sm"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/75 backdrop-blur-md" />

      <section className="relative w-full max-w-[560px] rounded-3xl border border-white/14 bg-[#0b0b0b]/90 px-6 py-10 text-center shadow-[0_40px_120px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12">
        <div className="flex justify-center">
          <ArkMark
            className="h-[18px] w-auto sm:h-[22px]"
            style={{ width: undefined, height: undefined }}
          />
        </div>

        <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3.5 py-1.5 text-[11.5px] font-semibold tracking-[0.16em] text-amber-200 uppercase">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
          </span>
          {t("eyebrow")}
        </span>

        <h1
          id="dashboard-lock-title"
          className="ws-display mt-6 text-[clamp(28px,5vw,46px)] leading-[1.08] font-extrabold tracking-[-0.02em] [text-wrap:balance] text-white"
        >
          {t("title", { brand: BRAND })}
        </h1>

        <p
          id="dashboard-lock-body"
          className="mt-5 text-[clamp(14.5px,1.5vw,17px)] leading-[1.6] font-light text-white/80"
        >
          {t("body")}
        </p>

        <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-xl bg-white px-6 py-3 text-[14px] font-semibold text-black transition-colors hover:bg-white/90"
          >
            {t("home")}
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="rounded-xl border border-white/14 bg-white/6 px-6 py-3 text-[14px] font-medium text-white transition-colors hover:border-white/24 hover:bg-white/10"
          >
            {t("email")}
          </a>
        </div>
      </section>
    </div>
  );
}
