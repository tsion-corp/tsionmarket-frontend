import {
  BulbIcon,
  ChartBarsIcon,
  GridIcon,
  HouseIcon,
  SwapIcon,
  TrendIcon,
} from "@/components/ui/icons";
import type { DashboardView } from "@/components/dashboard/modal-types";

export interface NavItem {
  key: DashboardView | "rwa";
  label: string;
  icon: (props: { size?: number }) => React.ReactNode;
  href?: string;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "portfolio", label: "Portfolio", icon: GridIcon },
  { key: "swap", label: "Swap", icon: SwapIcon },
  { key: "perps", label: "Perps", icon: TrendIcon },
  { key: "markets", label: "Markets", icon: ChartBarsIcon },
  { key: "prediction", label: "Prediction", icon: BulbIcon },
  { key: "rwa", label: "RWA", icon: HouseIcon, href: "/rwa", badge: "SUB-APP" },
];
