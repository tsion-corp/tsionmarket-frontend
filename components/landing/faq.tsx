import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

const FAQS = [
  {
    q: "Is World Street a bank or exchange holding my money?",
    a: "No. Your money stays in your own account, not ours. We can't freeze it or move it.",
    open: true,
  },
  {
    q: "Do I need to understand crypto to use it?",
    a: "No. Sign in like any app, fund by bank transfer, and buy assets like you'd shop online.",
  },
  {
    q: "What can I actually trade?",
    a: "Stocks, gold, government bonds, leveraged trading, prediction markets, and instant swaps today. Auto-earn and collectibles are next.",
  },
  {
    q: "How do I fund my account?",
    a: "Transfer from your bank. It converts in seconds, and you can withdraw back to your bank just as fast.",
  },
  {
    q: "When does it launch?",
    a: "We're rolling out access in waves. Sign up now to be near the front of the line.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative z-[2] bg-black px-6 py-[70px]">
      <div className="mx-auto max-w-[820px]">
        <Reveal className="mb-10 text-center">
          <Eyebrow>Questions</Eyebrow>
          <h2 className="ws-serif mt-3 text-[clamp(34px,4.6vw,56px)] tracking-[-0.03em]">
            Good to know
          </h2>
        </Reveal>
        <Reveal className="flex flex-col gap-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              open={f.open}
              className="group rounded-2xl border border-white/10 bg-white/4 px-[22px] py-0.5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[18px] text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-accent shrink-0 text-[22px] leading-none transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-5 text-[15px] leading-[1.6] font-light text-white/80">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
