import type { NormalSport } from "../api";
import type { BoardSelection, LeagueBoardGroup } from "../presenter";
import { FixtureRow } from "./fixture-row";
import { ProviderArtwork } from "./provider-artwork";

interface LeagueSectionProps {
  group: LeagueBoardGroup;
  selectedIds: ReadonlySet<string>;
  onSelect: (selection: BoardSelection) => void;
  onRemoveSelection: (selectionId: string) => void;
  sport: NormalSport;
  activeLeague: string;
}

function fixtureDate(startTime: string | null): string {
  if (!startTime) return "Date to be confirmed";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(startTime));
}

export function LeagueSection({
  group,
  selectedIds,
  onSelect,
  onRemoveSelection,
  sport,
  activeLeague,
}: LeagueSectionProps) {
  const byDate = new Map<string, typeof group.fixtures>();
  for (const fixture of group.fixtures) {
    const label = fixtureDate(fixture.startTime);
    const existing = byDate.get(label);
    if (existing) existing.push(fixture);
    else byDate.set(label, [fixture]);
  }

  return (
    <section className="overflow-hidden border-y border-white/9 bg-[#111114] sm:rounded-[12px] sm:border sm:shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <header className="flex min-h-11 items-center gap-2.5 border-b border-white/8 bg-[linear-gradient(180deg,#1c1e22_0%,#151619_100%)] px-2.5 sm:min-h-14 sm:gap-3 sm:px-4">
        <ProviderArtwork
          src={group.imageUrl}
          alt={`${group.name} logo`}
          initials={group.name}
          size="league"
        />
        <div className="min-w-0">
          <h2 className="truncate text-[12px] font-extrabold text-white sm:text-[14px]">
            {group.name}
          </h2>
          <p className="mt-0.5 text-[9px] font-semibold tracking-[0.08em] text-white/35 uppercase sm:text-[10px]">
            Matches
          </p>
        </div>
      </header>

      <div className="lg:[scrollbar-width:thin] lg:overflow-x-auto">
        <div className="lg:min-w-[850px]">
          <div className="hidden grid-cols-[minmax(260px,1fr)_repeat(3,82px)_58px_repeat(2,82px)_52px] gap-1.5 bg-black/25 px-3 py-2 text-center text-[9px] font-bold tracking-[0.09em] text-white/35 uppercase lg:grid">
            <span className="text-left">Fixture</span>
            <span>1</span>
            <span>X</span>
            <span>2</span>
            <span>Goals</span>
            <span>Over</span>
            <span>Under</span>
            <span>More</span>
          </div>

          {[...byDate.entries()].map(([date, fixtures]) => (
            <div key={date}>
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(48px,56px))] items-center gap-1 border-t border-white/[0.065] bg-white/[0.035] px-2.5 py-1.5 text-[9px] font-bold tracking-[0.08em] text-white/42 uppercase lg:block lg:px-3 lg:text-[10px]">
                <span>{date}</span>
                {(["1", "X", "2"] as const).map((label) => (
                  <span key={label} className="text-center lg:hidden">
                    {label}
                  </span>
                ))}
              </div>
              {fixtures.map((fixture) => (
                <FixtureRow
                  key={fixture.id}
                  fixture={fixture}
                  selectedIds={selectedIds}
                  onSelect={onSelect}
                  onRemoveSelection={onRemoveSelection}
                  detailHref={`/prediction/markets/${fixture.id}?category=${sport}&league=${activeLeague || group.slug}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
