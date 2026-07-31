import {
  BriefcaseIcon,
  BulbIcon,
  DiceIcon,
  GridIcon,
  HouseIcon,
  TrendIcon,
} from "@/components/ui/icons";
import { SECTION_LABEL, orderedSections, type SectionId } from "@/lib/sections";

export const SECTION_ICONS: Record<SectionId, (props: { size?: number }) => React.ReactNode> = {
  portfolio: GridIcon,
  trade: TrendIcon,
  rwa: HouseIcon,
  prediction: BulbIcon,
  earn: BriefcaseIcon,
  casino: DiceIcon,
};

export interface NavItem {
  id: SectionId;
  label: string;
  icon: (props: { size?: number }) => React.ReactNode;
}

// `translate` localizes the labels (a next-intl t scoped to "sections");
// without it the English SECTION_LABEL stands in.
export function buildNav(
  interest: string | null,
  translate?: (id: SectionId) => string
): NavItem[] {
  return orderedSections(interest).map((id) => ({
    id,
    label: translate ? translate(id) : SECTION_LABEL[id],
    icon: SECTION_ICONS[id],
  }));
}
