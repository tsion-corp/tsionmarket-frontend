import { BulbIcon, ChartBarsIcon, GridIcon, HouseIcon, TrendIcon } from "@/components/ui/icons";
import { SECTION_LABEL, orderedSections, type SectionId } from "@/lib/sections";

export const SECTION_ICONS: Record<SectionId, (props: { size?: number }) => React.ReactNode> = {
  portfolio: GridIcon,
  trade: TrendIcon,
  markets: ChartBarsIcon,
  rwa: HouseIcon,
  prediction: BulbIcon,
};

export interface NavItem {
  id: SectionId;
  label: string;
  icon: (props: { size?: number }) => React.ReactNode;
}

export function buildNav(interest: string | null): NavItem[] {
  return orderedSections(interest).map((id) => ({
    id,
    label: SECTION_LABEL[id],
    icon: SECTION_ICONS[id],
  }));
}
