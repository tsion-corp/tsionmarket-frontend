import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

const FAQS = [
  {
    q: "Is World Street a bank or exchange holding my money?",
    a: "No. World Street is non-custodial. Your assets sit in a self-custody wallet only you control. We never take possession of your funds, so we can't freeze or lend them.",
    open: true,
  },
  {
    q: "Do I need to understand crypto to use it?",
    a: "Not at all. You sign in with your social login, fund with a normal bank transfer, and buy assets like on any app. The crypto complexity runs quietly in the background.",
  },
  {
    q: "What can I actually trade?",
    a: "At launch: tokenized stocks, gold and treasuries, perpetual futures, prediction markets, and instant token swaps. Yield vaults and collectibles follow soon after.",
  },
  {
    q: "How do I fund my account from Nigeria?",
    a: "Transfer Naira directly from your bank. It converts to stable value in seconds so you can invest immediately, and you can withdraw back to any Nigerian bank just as fast.",
  },
  {
    q: "When does it launch?",
    a: "We're rolling out access in waves to the early list. Sign up and you'll be among the first invited when your region opens.",
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
