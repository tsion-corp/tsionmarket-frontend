"use client";

import { useTranslations } from "next-intl";
import { ChartLineIcon, ChevronDownIcon, ChevronDownSoftIcon } from "@/components/ui/icons";

// Which way the 24h change moved. "flat" covers an exact zero and a market with
// no prior close, both of which must not be painted as a gain.
export type SpotChangeDirection = "up" | "down" | "flat";

// Gain and loss use the semantic price tokens, not the Buy/Sell action colours.
const CHANGE_TONE: Record<SpotChangeDirection, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-grey-400",
};

// The pill's measurements from Figma 173:42174, shared by the badge and by the
// perps trigger so the two never drift apart. A plain `border` renders the edge
// at 1px, which is why the weight is spelled out.
const PILL_SHAPE =
  "ws-discovery-title border-hairline bg-surface text-grey-100 flex h-[40.5px] items-center gap-[5.5px] rounded-2xl border-[1.686px] px-[11px] text-[15px] whitespace-nowrap";

export interface SpotTokenBadgeProps {
  // Whatever the composer wants named in the pill, already formatted. The badge
  // prints the string as given and reads nothing into its shape, so a single
  // symbol, a pair, or a market code all render the same way.
  symbol: string;
  className?: string;
}

export interface SpotPairSelectorProps {
  // Display label for the market, already formatted, e.g. "BTC/USDT".
  pair: string;
  // Opens the market picker. The list itself is not part of this strip.
  onSelectPair: () => void;
  // True while the composer is showing that picker, so the trigger can report
  // the state it does not own.
  menuOpen?: boolean;
}

export interface SpotChartDisclosureProps {
  expanded: boolean;
  onToggle: () => void;
  // id of the chart panel this control shows and hides. The panel is rendered
  // by whoever composes the trade panel.
  panelId: string;
}

export interface SpotPairHeaderProps {
  // The market the ticket is pointed at, as it should read in the pill.
  symbol: string;
  // The 24h change, already formatted for display, e.g. "-2.20%".
  change24h: string;
  changeDirection: SpotChangeDirection;
  chartExpanded: boolean;
  onToggleChart: () => void;
  // id of the chart panel the disclosure shows and hides. Owned by whoever
  // renders that panel.
  chartPanelId: string;
  className?: string;
}

// The pill that names the market on the spot ticket. A label and nothing else:
// the market is picked from the list beside the ticket, so this element has no
// behaviour to advertise and carries no chevron.
export function SpotTokenBadge({ symbol, className }: SpotTokenBadgeProps) {
  return <span className={`${PILL_SHAPE} ${className ?? ""}`}>{symbol}</span>;
}

// The same pill as a picker trigger, for surfaces that have no market list of
// their own. Perps composes this one: its market is changed from the ticket, so
// there the chevron names a real affordance.
export function SpotPairSelector({ pair, onSelectPair, menuOpen = false }: SpotPairSelectorProps) {
  const t = useTranslations("spot");
  return (
    <button
      type="button"
      onClick={onSelectPair}
      aria-haspopup="listbox"
      aria-expanded={menuOpen}
      className={`${PILL_SHAPE} cursor-pointer transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none`}
    >
      {pair}
      <span className="sr-only">{t("selectMarket")}</span>
      <ChevronDownIcon size={11} className="text-white/70" />
    </button>
  );
}

// "View Chart": a disclosure for the chart panel below. It reports the toggle
// and points aria at the panel; it never renders the chart.
export function SpotChartDisclosure({ expanded, onToggle, panelId }: SpotChartDisclosureProps) {
  const t = useTranslations("spot");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={panelId}
      className="ws-discovery-title flex cursor-pointer items-center gap-[8.994px] rounded-md text-[14px] tracking-[-0.07px] text-white transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none"
    >
      {/* The design reads as two parts, not four evenly spaced ones: the dot,
          the chart glyph and the label sit tight together at 4.5px, and the
          chevron stands off that whole cluster at twice the distance.
          The dot and the glyph carry the design's own accent, #FFD62F, which
          is --color-kash. The label beside them stays white. */}
      <span className="flex items-center gap-[4.5px]">
        <span aria-hidden className="bg-kash size-[3.5px] shrink-0 rounded-full" />
        <ChartLineIcon className="text-kash shrink-0" />
        {t("viewChart")}
      </span>
      {/* The chevron gets a box wider than the mark, so the row keeps the
          design's gap to the label while the click target stays generous. The
          box turns rather than the glyph, which keeps the rotation centred on
          the mark. 11.2425 is the glyph's own frame: the arms span 8.994px of
          it and the stroke takes the rest. */}
      <span
        aria-hidden
        className={`flex size-[17.988px] shrink-0 items-center justify-center transition-transform ${expanded ? "rotate-180" : "rotate-0"}`}
      >
        <ChevronDownSoftIcon size={11.2425} className="text-white/70" />
      </span>
    </button>
  );
}

// The top strip of the Spot trade panel: the market badge, the 24h change, and
// the chart disclosure. There is no Limit/Market control here: spot orders on
// this rail are market orders, so a toggle would offer a choice the desk does
// not have. Perps keeps the toggle, and composes SpotOrderModeToggle directly.
//
// Presentational and fully controlled, so the composer owns every piece of
// state and all values arrive display-ready.
export function SpotPairHeader({
  symbol,
  change24h,
  changeDirection,
  chartExpanded,
  onToggleChart,
  chartPanelId,
  className,
}: SpotPairHeaderProps) {
  const t = useTranslations("spot");
  return (
    <div className={`flex flex-col gap-[18px] ${className ?? ""}`}>
      <div className="flex items-center gap-[13.5px]">
        <SpotTokenBadge symbol={symbol} />
        <span className="ws-discovery-title text-[15px] whitespace-nowrap">
          <span className="sr-only">{t("change24h")}</span>
          <span className={CHANGE_TONE[changeDirection]}>{change24h}</span>
        </span>
      </div>
      <SpotChartDisclosure
        expanded={chartExpanded}
        onToggle={onToggleChart}
        panelId={chartPanelId}
      />
    </div>
  );
}
