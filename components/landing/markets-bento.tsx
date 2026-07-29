import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  BulbIcon,
  ChartBarsIcon,
  CollectiblesIcon,
  SwapIcon,
  TrendIcon,
  YieldIcon,
} from "@/components/ui/icons";

function IconTile({ children, accent = true }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`grid h-11 w-11 place-items-center rounded-xl border ${
        accent
          ? "border-accent/20 bg-accent/12 text-accent"
          : "border-white/12 bg-white/6 text-white"
      }`}
    >
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/12 bg-white/8 px-3 py-[5px] text-xs font-normal text-white/90">
      {children}
    </span>
  );
}

export function MarketsBento() {
  return (
    <section id="markets" className="relative z-[2] bg-black px-6 pt-[110px] pb-[60px]">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="mb-11 max-w-[40ch]">
          <Eyebrow>Everything you can own</Eyebrow>
          <h2 className="ws-display mt-3.5 text-[clamp(36px,5.5vw,68px)] leading-[1.02] tracking-[-0.03em]">
            One app, every market
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <Reveal className="relative min-h-[260px] overflow-hidden rounded-[24px] border border-white/12 bg-white/5 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px] sm:p-[34px] md:col-span-4">
            <div className="absolute top-[26px] right-7 hidden max-w-[70%] flex-wrap justify-end gap-[7px] sm:flex">
              <Chip>Fractional</Chip>
              <Chip>24/7</Chip>
              <Chip>No minimums</Chip>
            </div>
            <IconTile>
              <ChartBarsIcon size={22} />
            </IconTile>
            <h3 className="ws-display mt-[70px] max-w-[20ch] text-[clamp(28px,3.4vw,40px)] leading-[1.04] tracking-[-0.02em]">
              Stocks, gold &amp; treasuries
            </h3>
            <p className="mt-3.5 max-w-[44ch] text-[15px] leading-[1.55] font-normal text-white/82">
              Own a piece of Apple, real gold, or government bonds, starting with a few dollars.
            </p>
          </Reveal>

          <Reveal
            delay={0.08}
            className="flex min-h-[260px] flex-col rounded-[24px] border border-white/12 bg-white/5 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px] md:col-span-2"
          >
            <IconTile>
              <TrendIcon size={22} />
            </IconTile>
            <div className="mt-auto pt-6">
              <div className="mb-3.5 flex flex-wrap gap-[7px]">
                <Chip>Leverage</Chip>
                <Chip>Advanced</Chip>
                <Chip>Higher risk</Chip>
              </div>
              <h3 className="ws-display text-[28px] tracking-[-0.02em]">Leveraged trading</h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.55] font-normal text-white/82">
                Bet on prices rising or falling, with your gains or losses multiplied.
              </p>
            </div>
          </Reveal>

          <Reveal className="flex min-h-[210px] flex-col rounded-[24px] border border-white/12 bg-white/5 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px] md:col-span-3">
            <IconTile>
              <BulbIcon size={22} />
            </IconTile>
            <div className="mt-auto pt-6">
              <h3 className="ws-display text-[28px] tracking-[-0.02em]">Trade on Events</h3>
              <p className="mt-2.5 max-w-[40ch] text-[14.5px] leading-[1.55] font-normal text-white/82">
                Put money on what you think will happen, in politics, sports, or world events. Get
                paid the moment the result lands.
              </p>
            </div>
          </Reveal>

          <Reveal
            delay={0.08}
            className="flex min-h-[210px] flex-col rounded-[24px] border border-white/12 bg-white/5 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px] md:col-span-3"
          >
            <IconTile>
              <SwapIcon size={22} />
            </IconTile>
            <div className="mt-auto pt-6">
              <h3 className="ws-display text-[28px] tracking-[-0.02em]">Games</h3>
              <p className="mt-2.5 max-w-[40ch] text-[14.5px] leading-[1.55] font-normal text-white/82">
                Play different games, grow your money, cash out whenever you choose.
              </p>
            </div>
          </Reveal>

          <Reveal className="flex min-h-[180px] flex-col rounded-[24px] border border-white/12 bg-white/5 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px] md:col-span-3">
            <IconTile accent={false}>
              <YieldIcon size={22} />
            </IconTile>
            <div className="mt-auto pt-6">
              <h3 className="ws-display text-[26px] tracking-[-0.02em]">
                Auto-earn{" "}
                <span className="font-sans text-xs font-normal text-white/55 not-italic">
                  · soon
                </span>
              </h3>
              <p className="mt-2.5 max-w-[40ch] text-[14.5px] leading-[1.55] font-normal text-white/82">
                Put idle balances to work, in strategies reviewed by professionals.
              </p>
            </div>
          </Reveal>

          <Reveal
            delay={0.08}
            className="flex min-h-[180px] flex-col rounded-[24px] border border-white/12 bg-white/5 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px] md:col-span-3"
          >
            <IconTile accent={false}>
              <CollectiblesIcon size={22} />
            </IconTile>
            <div className="mt-auto pt-6">
              <h3 className="ws-display text-[26px] tracking-[-0.02em]">
                Collectibles (NFTs){" "}
                <span className="font-sans text-xs font-normal text-white/55 not-italic">
                  · soon
                </span>
              </h3>
              <p className="mt-2.5 max-w-[40ch] text-[14.5px] leading-[1.55] font-normal text-white/82">
                Collect and trade digital items, right alongside the rest of your portfolio.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
