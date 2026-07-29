import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

const STEPS = [
  {
    n: "01",
    title: "Sign in",
    body: "Google, X, or email. Takes seconds.",
  },
  {
    n: "02",
    title: "Choose your market",
    body: "Stocks, gold, crypto, or whatever you're after.",
  },
  {
    n: "03",
    title: "Fund and trade",
    body: "Top up by bank transfer, buy your first asset in minutes.",
  },
];

const STATS = [
  { value: "12,000+", label: "On the waitlist" },
  { value: "Multiple", label: "Markets in one app" },
  { value: "100%", label: "Self-custody, always" },
  { value: "24/7", label: "Global market access" },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative z-[2] bg-black px-6 pt-[70px] pb-[60px]">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="mb-[46px] text-center">
          <Eyebrow>From zero to trading</Eyebrow>
          <h2 className="ws-display mx-auto mt-3.5 max-w-[24ch] text-[clamp(34px,4.8vw,60px)] leading-[0.94] tracking-[-0.03em]">
            No jargon. No seed phrase. Just start.
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 0.08}
              className="rounded-[22px] border border-white/12 bg-white/5 p-[30px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px]"
            >
              <span className="ws-display text-accent text-[44px] leading-[0.8]">{s.n}</span>
              <h3 className="ws-display mt-5 text-2xl tracking-[-0.01em]">{s.title}</h3>
              <p className="mt-2.5 text-[15px] leading-[1.55] font-light text-white/82">{s.body}</p>
            </Reveal>
          ))}
        </div>
        <div className="mt-[46px] grid grid-cols-2 gap-4 md:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal
              key={s.label}
              delay={i * 0.06}
              className="rounded-[20px] border border-white/10 bg-white/4 p-[26px] text-center"
            >
              <div className="ws-display text-accent text-[clamp(30px,3.4vw,44px)] leading-[0.85]">
                {s.value}
              </div>
              <div className="mt-2 text-[13px] font-normal text-white/70">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
