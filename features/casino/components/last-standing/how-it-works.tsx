"use client";

import { useTranslations } from "next-intl";

// The steps are a real sequence, so they are numbered. The payout split is
// not, so it is not.
const STEPS = [1, 2, 3, 4] as const;

interface HowItWorksProps {
  /** Opens the start sheet, so the explanation ends somewhere. */
  onStart?: () => void;
  startLabel?: string;
}

// What the game is, for somebody who has never played it. Written for a person
// being shown this at a stand, so it leads with the one-line version and keeps
// the numbers concrete.
export function HowItWorks({ onStart, startLabel }: HowItWorksProps) {
  const t = useTranslations("casino.lastStanding");

  return (
    <div className="mt-5 flex flex-col gap-5">
      <section className="ws-inset px-4 py-5 sm:px-6 sm:py-6">
        <h2 className="ws-display text-[21px] tracking-[-0.01em] sm:text-[24px]">
          {t("howTitle")}
        </h2>
        <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.6] font-normal text-white/70">
          {t("howIntro")}
        </p>
      </section>

      <section>
        <ol className="flex flex-col gap-2.5">
          {STEPS.map((step) => (
            <li key={step} className="ws-inset flex gap-3.5 px-4 py-4 sm:gap-4">
              <span
                aria-hidden
                className="bg-accent/15 text-accent tnum grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
              >
                {step}
              </span>
              <div className="min-w-0">
                <h3 className="text-[14.5px] font-semibold text-white">
                  {t(`howStep${step}Title`)}
                </h3>
                <p className="mt-1 text-[13.5px] leading-[1.6] font-normal text-white/60">
                  {t(`howStep${step}Body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ws-inset px-4 py-5 sm:px-6">
        <h3 className="text-[14.5px] font-semibold text-white">{t("howSplitTitle")}</h3>
        <p className="mt-1 text-[13px] leading-[1.6] font-normal text-white/55">
          {t("howSplitIntro")}
        </p>
        <dl className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {[
            { pct: "50%", label: t("howSplitWinner"), accent: true },
            { pct: "10%", label: t("howSplitStarter"), accent: false },
            { pct: "40%", label: t("howSplitHouse"), accent: false },
          ].map((slice) => (
            <div
              key={slice.label}
              className={
                "rounded-[14px] border px-3.5 py-3 " +
                (slice.accent
                  ? "border-accent/35 bg-accent/[0.08]"
                  : "border-white/10 bg-white/[0.03]")
              }
            >
              <dt
                className={
                  "tnum ws-display text-[22px] tracking-[-0.01em] " +
                  (slice.accent ? "text-accent" : "text-white/80")
                }
              >
                {slice.pct}
              </dt>
              <dd className="mt-0.5 text-[12.5px] leading-[1.45] font-normal text-white/55">
                {slice.label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-3">
        {[
          { k: "Timer", v: "60s" },
          { k: "Stake", v: "$0.10" },
          { k: "Chain", v: "Base" },
        ].map((fact) => (
          <div key={fact.k} className="ws-inset px-4 py-3.5">
            <div className="text-[11px] font-semibold tracking-[0.08em] text-white/35 uppercase">
              {t(`howFact${fact.k}`)}
            </div>
            <div className="ws-display mt-1 text-[18px] tracking-[-0.01em]">{fact.v}</div>
            <p className="mt-1 text-[12px] leading-[1.5] font-normal text-white/50">
              {t(`howFact${fact.k}Body`)}
            </p>
          </div>
        ))}
      </section>

      {onStart && startLabel ? (
        <div className="ws-inset flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="text-[14.5px] font-semibold text-white">{t("howReadyTitle")}</h3>
            <p className="mt-1 text-[13px] leading-[1.55] font-normal text-white/60">
              {t("howReadyBody")}
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="bg-accent shrink-0 cursor-pointer rounded-[12px] px-5 py-2.5 text-[13.5px] font-semibold text-black"
          >
            {startLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
