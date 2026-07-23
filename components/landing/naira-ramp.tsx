import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CheckIcon } from "@/components/ui/icons";
import { RampCard } from "@/components/landing/ramp-card";

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
          <Eyebrow>Naira on / off ramp</Eyebrow>
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

        <Reveal delay={0.1}>
          <RampCard />
        </Reveal>
      </div>
    </section>
  );
}
