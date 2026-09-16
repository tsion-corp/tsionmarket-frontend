import {
  BriefcaseIcon,
  BulbIcon,
  ChartBarsIcon,
  DiceIcon,
  ClockIcon,
  FlameIcon,
  GridIcon,
  HouseIcon,
  TrendIcon,
} from "@/components/ui/icons";
import {
  HIDDEN_NAV_SECTIONS,
  SECTION_LABEL,
  orderedSections,
  type SectionId,
} from "@/lib/sections";

// The square's mark, the same asset the rail draws for its entry, so the two
// cannot disagree. Sized like the line icons beside it.
function SquareMarkIcon({ size = 20 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local static asset, sized by the caller
    <img
      src="/nav/market-square.svg"
      alt=""
      width={size}
      height={size}
      style={{ width: size * 0.856, height: size * 0.637 }}
    />
  );
}

export const SECTION_ICONS: Record<SectionId, (props: { size?: number }) => React.ReactNode> = {
  portfolio: GridIcon,
  spot: ChartBarsIcon,
  perps: TrendIcon,
  meme: FlameIcon,
  rwa: HouseIcon,
  prediction: BulbIcon,
  earn: BriefcaseIcon,
  casino: DiceIcon,
  activity: ClockIcon,
  square: SquareMarkIcon,
};

export interface NavItem {
  id: SectionId;
  label: string;
  icon: (props: { size?: number }) => React.ReactNode;
}

// `translate` localizes the labels (a next-intl t scoped to "sections");
// without it the English SECTION_LABEL stands in.
//
// HIDDEN_NAV_SECTIONS drops the sections that are hidden for now, Real assets
// today. The filter sits here rather than in orderedSections so the section
// order itself is untouched: a hidden section keeps its route, its place in
// the interest map, and the rail highlight it would get from its path, and
// only loses its way in. Every nav surface reads this one list, so they hide
// and return together.
export function buildNav(
  interest: string | null,
  translate?: (id: SectionId) => string
): NavItem[] {
  return orderedSections(interest)
    .filter((id) => !HIDDEN_NAV_SECTIONS.includes(id))
    .map((id) => ({
      id,
      label: translate ? translate(id) : SECTION_LABEL[id],
      icon: SECTION_ICONS[id],
    }));
}
