import { useTranslations } from "next-intl";
import { ArkMark } from "@/components/ui/ark-mark";
import { BRAND, SUPPORT_EMAIL, WHATSAPP_NUMBER } from "@/lib/brand";

// What the site serves while NEXT_PUBLIC_APP_ACTIVE is false (see
// lib/launch-gate.ts). Distinct from the waitlist page, which is the
// pre-launch story: this one is for an app that is already live and has
// people's money in it, so it leads with the account being fine and carries
// the support contacts rather than a signup form.
//
// A server component. Nothing here is interactive, and the page has to render
// when the rest of the app is assumed broken, so it depends on as little as
// possible: no Privy, no query client, no language picker.
export function MaintenancePage() {
  const t = useTranslations("maintenance");
  const tFooter = useTranslations("landing.footer");

  return (
    <main className="relative flex min-h-[100svh] flex-col overflow-hidden bg-black">
      {/* The film's opening frame as a still, the same one the waitlist page
          uses. Decorative, and a plain img so no loader or remote host is
          involved. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/film/w0-still.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-50"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/70 to-black/95"
      />

      <header className="relative z-10 mx-auto w-full max-w-[1120px] px-6 pt-7">
        <ArkMark
          className="h-[17px] w-auto sm:h-[22px]"
          style={{ width: undefined, height: undefined }}
        />
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/6 px-3.5 py-1.5 text-[11.5px] font-medium tracking-[0.16em] text-white/70 uppercase backdrop-blur-[30px]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          {t("eyebrow")}
        </span>

        <h1 className="ws-display mt-8 text-[clamp(26px,4.4vw,44px)] leading-[1.12] tracking-[-0.015em] [text-wrap:balance]">
          {t("title")}
        </h1>

        {/* The one thing a user with a balance actually wants to know. */}
        <p className="mt-5 text-[clamp(14.5px,1.5vw,17px)] leading-[1.6] font-light text-[rgba(244,244,244,0.85)]">
          {t("funds")}
        </p>

        <p className="mt-4 text-[14px] leading-[1.6] font-light text-white/55">{t("back")}</p>

        <div className="mt-9 w-full border-t border-white/8 pt-7">
          <span className="text-[11px] font-normal tracking-[0.14em] text-white/40 uppercase">
            {t("contactTitle")}
          </span>
          <div className="mt-3.5 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="w-full rounded-xl border border-white/14 bg-white/6 px-5 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:border-white/24 hover:bg-white/10 sm:w-auto"
            >
              {t("email")}
            </a>
            {/*<a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="w-full rounded-xl border border-white/14 bg-white/6 px-5 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:border-white/24 hover:bg-white/10 sm:w-auto"
            >
              {t("whatsapp")}
            </a>*/}
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-[1120px] border-t border-white/8 px-6 py-6 text-center">
        <span className="text-[12.5px] font-normal text-white/40">
          {tFooter("rights", { brand: BRAND })}
        </span>
      </footer>
    </main>
  );
}
