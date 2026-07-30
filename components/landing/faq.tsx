import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

// Copy lives in the landing.faq catalog. The first entry renders open.
const FAQ_KEYS = [
  { q: "q1", a: "a1", open: true },
  { q: "q2", a: "a2" },
  { q: "q3", a: "a3" },
  { q: "q4", a: "a4" },
  { q: "q5", a: "a5" },
] as const;

export function Faq() {
  const t = useTranslations("landing.faq");
  return (
    <section id="faq" className="relative z-[2] bg-black px-6 py-[70px]">
      <div className="mx-auto max-w-[820px]">
        <Reveal className="mb-10 text-center">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mt-3 text-[clamp(34px,4.6vw,56px)] tracking-[-0.03em]">
            {t("title")}
          </h2>
        </Reveal>
        <Reveal className="flex flex-col gap-3">
          {FAQ_KEYS.map((f) => (
            <details
              key={f.q}
              open={"open" in f && f.open}
              className="group rounded-2xl border border-white/10 bg-white/4 px-[22px] py-0.5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[18px] text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                {t(f.q, { brand: "TSION" })}
                <span className="text-accent shrink-0 text-[22px] leading-none transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-5 text-[15px] leading-[1.6] font-light text-white/80">{t(f.a)}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
