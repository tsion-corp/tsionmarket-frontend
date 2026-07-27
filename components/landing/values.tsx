import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { GlobeIcon, LockIcon, ShieldIcon } from "@/components/ui/icons";

const VALUES = [
  {
    icon: <LockIcon size={22} />,
    chips: ["Your keys", "No freezes", "Fully yours"],
    title: "Non-custodial",
    body: "Your money stays in your own account, not ours. We can't freeze it, lend it out, or lose it.",
  },
  {
    icon: <GlobeIcon size={22} />,
    chips: ["Permissionless", "Open access", "Borderless"],
    title: "Censorship-resistant",
    body: "Nobody can block your payment or shut you out of your money, not a company, not a government.",
  },
  {
    icon: <ShieldIcon size={22} />,
    chips: ["Full control", "Export anytime", "Transparent"],
    title: "Self-sovereign",
    body: "Take your funds anywhere, anytime. Nothing here is locked to us.",
  },
];

export function Values() {
  return (
    <section id="values" className="relative z-[2] bg-black px-6 pt-[70px] pb-[60px]">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="mb-11">
          <Eyebrow>What you actually control</Eyebrow>
          <h2 className="ws-serif mt-3.5 text-[clamp(36px,5.5vw,68px)] leading-[1.02] tracking-[-0.03em]">
            Yours alone
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
          {VALUES.map((v, i) => (
            <Reveal
              key={v.title}
              delay={i * 0.08}
              className="flex min-h-[300px] flex-col rounded-[22px] border border-white/12 bg-white/5 p-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px] md:min-h-[340px]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/12 bg-white/6 text-white">
                  {v.icon}
                </span>
                <div className="flex max-w-[74%] flex-wrap justify-end gap-1.5">
                  {v.chips.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-white/12 bg-white/7 px-[11px] py-[5px] text-xs font-normal text-white/90"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-auto pt-8">
                <h3 className="ws-serif text-[32px] leading-[1.04] tracking-[-0.02em]">
                  {v.title}
                </h3>
                <p className="mt-3 max-w-[32ch] text-[14.5px] leading-[1.55] font-normal text-white/85">
                  {v.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
