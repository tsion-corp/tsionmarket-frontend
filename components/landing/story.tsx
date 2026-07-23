import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { TwistingRibbon } from "@/components/landing/twisting-ribbon";

export function Story() {
  return (
    <section id="story" className="relative flex min-h-[50vh] items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <TwistingRibbon className="h-full w-full" />
      </div>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.4)_40%,rgba(0,0,0,0.9)_100%)]" />
      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-8">
        <Reveal>
          <Eyebrow>Why we built this</Eyebrow>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="ws-serif mt-[18px] max-w-[20ch] text-[clamp(38px,7vw,96px)] leading-[1.02] tracking-[-0.03em]">
            Finance without borders.
            <br />
            Wealth without gatekeepers.
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-[52ch] text-[clamp(16px,1.7vw,19px)] leading-[1.6] font-light text-white/90">
            Your ability to save, send and grow your wealth should never need anyone&apos;s
            permission. World Street puts the whole market in your hands, and the keys stay yours
            alone.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
