/**
 * A catalogue section heading (Figma 2234:10829 / 2234:10885): a 24px bold title
 * over a 15px grey one-liner, e.g. "Trending Now" / "The games getting most
 * action on Arkade". Presentational; the strings come from the caller.
 */

export interface ArkadeSectionHeaderProps {
  title: string;
  subtitle?: string;
}

export function ArkadeSectionHeader({ title, subtitle }: ArkadeSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-serif text-[24px] leading-[1.02] font-bold tracking-[-0.72px] text-white capitalize">
        {title}
      </h2>
      {subtitle ? (
        <p className="font-serif text-[15px] leading-none font-semibold text-[#8a8a8a]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
