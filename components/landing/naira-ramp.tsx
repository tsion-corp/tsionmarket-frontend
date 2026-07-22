import { Reveal } from "@/components/ui/reveal";
import { ArrowDownIcon, CheckIcon } from "@/components/ui/icons";

const POINTS = [
  "Instant bank-transfer funding",
  "Transparent, real-time rates",
  "Withdraw to any Nigerian bank",
];

export function NairaRamp() {
  return (
    <section id="naira" className="relative z-[2] bg-black px-6 pt-[70px] pb-[60px]">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 md:grid-cols-2">
        <Reveal>
          <div className="text-sm font-normal text-white/60">{"// Naira on / off ramp"}</div>
          <h2 className="ws-serif mt-3.5 text-[clamp(34px,4.6vw,60px)] leading-[1.02] tracking-[-0.03em]">
            Naira in.
            <br />
            Global assets out.
          </h2>
          <p className="mt-[18px] max-w-[44ch] text-base leading-[1.6] font-light text-white/85">
            Fund with a simple bank transfer and instantly own dollar assets, gold and crypto. Cash
            out back to Naira just as fast. No P2P, no middlemen, no waiting.
          </p>
          <div className="mt-[26px] flex flex-col gap-[13px]">
            {POINTS.map((p) => (
              <div
                key={p}
                className="flex items-center gap-[11px] text-[15px] font-light text-white/90"
              >
                <CheckIcon className="text-accent shrink-0" /> {p}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal
          delay={0.1}
          className="rounded-[24px] border border-white/12 bg-white/5 p-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.8)] backdrop-blur-[16px]"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="ws-serif text-[20px]">Add funds</span>
            <span className="text-xs text-white/60">≈ 1 sec</span>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
            <div className="mb-2 flex justify-between text-xs text-white/60">
              <span>From your bank</span>
              <span>Naira</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="bg-accent/14 text-accent grid h-[34px] w-[34px] place-items-center rounded-[10px] text-sm font-semibold">
                ₦
              </span>
              <span className="ws-serif tnum text-[28px]">250,000</span>
            </div>
          </div>
          <div className="my-2.5 flex justify-center">
            <span className="text-accent grid h-[34px] w-[34px] place-items-center rounded-full border border-white/14 bg-white/8">
              <ArrowDownIcon />
            </span>
          </div>
          <div className="border-accent/22 bg-accent/6 rounded-2xl border p-4">
            <div className="mb-2 flex justify-between text-xs text-white/60">
              <span>Available to invest</span>
              <span>USD</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="bg-accent/16 text-accent grid h-[34px] w-[34px] place-items-center rounded-[10px] text-sm font-semibold">
                $
              </span>
              <span className="ws-serif tnum text-accent text-[28px]">153.85</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
