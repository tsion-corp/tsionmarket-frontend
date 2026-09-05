import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { BRAND } from "@/lib/brand";
import { LAST_UPDATED, SECTIONS, SUPPORT_EMAIL } from "@/app/privacy/content";

// A guest page: no auth, no app shell, no sidebar. Someone reading a privacy
// policy is often deciding whether to sign up at all, and a page that demands
// an account first answers the question badly.
//
// Deliberately not linked from the footer or the nav. It is reachable at
// /privacy and by the links that have to point at it: app store listings,
// OAuth consent screens, a payment provider's onboarding form.
export const metadata: Metadata = {
  title: `Privacy Policy · ${BRAND}`,
  description: `How ${BRAND} collects, uses, shares and protects personal information.`,
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/8">
        <div className="mx-auto w-full max-w-[820px] px-5 py-5 sm:px-8">
          <Wordmark href="/" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[820px] px-5 pt-10 pb-24 sm:px-8">
        <h1 className="ws-display text-[32px] leading-[1.15] tracking-[-0.01em] sm:text-[40px]">
          Privacy Policy
        </h1>
        <p className="mt-3 text-[13px] font-normal text-white/45">Last updated {LAST_UPDATED}</p>

        {/* A policy nobody can navigate is a policy nobody reads. The contents
            list is anchors into the same page rather than a separate route. */}
        <nav aria-label="Contents" className="mt-8 rounded-[16px] border border-white/10 p-5">
          <h2 className="text-[11.5px] font-normal tracking-[0.1em] text-white/40 uppercase">
            Contents
          </h2>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {SECTIONS.map((section, i) => (
              <li key={section.id} className="text-[13.5px] font-normal">
                <a
                  href={`#${section.id}`}
                  className="hover:text-accent text-white/60 transition-colors"
                >
                  <span className="tnum mr-2 text-white/30">{i + 1}.</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 flex flex-col gap-10">
          {SECTIONS.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-8">
              <h2 className="ws-display text-[21px] tracking-[-0.005em]">
                <span className="tnum mr-2.5 text-white/30">{i + 1}.</span>
                {section.title}
              </h2>
              <div className="mt-3 flex flex-col gap-3.5">
                {section.body.map((block, b) =>
                  typeof block === "string" ? (
                    <p key={b} className="text-[14.5px] leading-[1.7] font-normal text-white/70">
                      {block}
                    </p>
                  ) : (
                    <ul key={b} className="flex flex-col gap-2 pl-1">
                      {block.items.map((item, n) => (
                        <li
                          key={n}
                          className="flex gap-2.5 text-[14.5px] leading-[1.7] font-normal text-white/70"
                        >
                          <span
                            aria-hidden
                            className="mt-[9px] size-1 shrink-0 rounded-full bg-white/30"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-14 border-t border-white/8 pt-6">
          <p className="text-[13.5px] leading-[1.7] font-normal text-white/45">
            Questions about this policy, or about the information we hold on you, go to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-[13.5px] font-normal text-white/45 transition-colors hover:text-white"
          >
            ← Back to {BRAND}
          </Link>
        </footer>
      </main>
    </div>
  );
}
