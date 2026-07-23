import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { ArrowUpRightIcon } from "@/components/ui/icons";

export function FinalCta() {
  return (
    <section
      id="early"
      className="relative flex min-h-[80vh] items-center justify-center overflow-hidden"
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.5)_45%,rgba(0,0,0,0.9)_100%)]" />
      <Reveal className="relative z-10 max-w-[760px] px-6 text-center">
        <h2 className="ws-serif mx-auto max-w-[18ch] text-[clamp(40px,6.5vw,88px)] leading-none tracking-[-0.03em]">
          Your money. Your world. Your call.
        </h2>
        <p className="mx-auto mt-[22px] max-w-[48ch] text-[17px] leading-[1.6] font-light text-white/90">
          Create your account in seconds and be first through the door when World Street opens in
          your region.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/auth"
            className="text-ink inline-flex items-center gap-2 rounded-full bg-white px-[26px] py-[15px] text-[15px] font-semibold whitespace-nowrap hover:opacity-90"
          >
            Get started
            <ArrowUpRightIcon className="text-arrow" />
          </Link>
        </div>
        <p className="mt-3.5 text-[13px] font-normal text-white/60">
          Free to join. Your keys stay yours from day one.
        </p>
      </Reveal>
    </section>
  );
}
