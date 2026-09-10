import {
  BriefcaseIcon,
  BulbIcon,
  ChartBarsIcon,
  DiceIcon,
  ClockIcon,
  FlameIcon,
  GridIcon,
  HouseIcon,
} from "@/components/ui/icons";
import {
  HIDDEN_NAV_SECTIONS,
  SECTION_LABEL,
  orderedSections,
  type SectionId,
} from "@/lib/sections";

export const SECTION_ICONS: Record<SectionId, (props: { size?: number }) => React.ReactNode> = {
  portfolio: GridIcon,
  spot: ChartBarsIcon,
  meme: FlameIcon,
  rwa: HouseIcon,
  prediction: BulbIcon,
  earn: BriefcaseIcon,
  casino: DiceIcon,
  activity: ClockIcon,
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
