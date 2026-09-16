"use client";

import type { ReactNode } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";

// Which way a 24h number moved. The caller owns the underlying figure and
// decides the direction, so no table compares numbers of its own.
export type ChangeDirection = "up" | "down" | "flat";

// One row of a desk's asset table, display-ready. Price, change and the
// trailing metric arrive as finished strings: this component formats nothing
// and does no arithmetic, which keeps money maths out of the presentation
// layer entirely.
export interface AssetRowView {
  // Stable identity, and what onSelect reports back. Usually the symbol, but a
  // contract address works when two markets share a ticker.
  id: string;
  symbol: string;
  // The second line, under the ticker. Usually the asset's full name.
  name: string;
  // Remote logo URL, or null to fall back to the built-in icon set.
  logo: string | null;
  // The chip behind the mark, as a CSS background. Which palette a desk draws
  // from is the desk's business, so it arrives already chosen.
  bg: string;
  // Optional mark beside the ticker, e.g. a yield pill. Most rows have none.
  badge?: ReactNode;
  price: string;
  change24h: string;
  changeDirection: ChangeDirection;
  // The fourth column. Market cap on the spot desk, liquidity on the real
  // assets desk: whichever figure that desk considers meaningful, formatted.
  metric: string;
}

// Column track shared by the header and every row, so the two stay aligned,
// including the horizontal inset: the design is not symmetric, it leaves about
// 15px on the left and 26px on the right, which is what pulls the last column
// off the panel edge. The three numeric columns are fixed pixel widths taken
// from the Figma frame so their right edges hold still while the asset column
// absorbs any change in panel width.
export const ASSET_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_95px_130px_146px] items-center pr-[25px] pl-[14px]";

const CHANGE_TONE: Record<ChangeDirection, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-white/55",
};

interface AssetTableRowProps {
  row: AssetRowView;
  selected: boolean;
  onSelect?: (id: string) => void;
}

export function AssetTableRow({ row, selected, onSelect }: AssetTableRowProps) {
  const choose = () => onSelect?.(row.id);

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={0}
      onClick={choose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
        }
      }}
      className={`${ASSET_COLUMNS} border-rule cursor-pointer border-b py-3 leading-[1.2] transition-colors outline-none last:border-b-0 hover:bg-white/4 focus-visible:bg-white/6 ${
        selected ? "bg-white/6" : ""
      }`}
    >
      <div role="gridcell" className="flex min-w-0 items-center gap-3">
        {/* The chip behind the mark. A brand-coloured token (BTC's orange, say)
            paints its own circle inside this, so no per-asset colour is written
            here: it arrives with the icon or the logo image. */}
        <span className="bg-grey-900 grid size-[33px] shrink-0 place-items-center overflow-hidden rounded-[11px]">
          <AssetIcon sym={row.symbol} bg={row.bg} logo={row.logo} size={33} fallback="gradient" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate font-serif text-[13.5px] font-medium text-white">
              {row.symbol}
            </div>
            {row.badge}
          </div>
          <div className="truncate text-[11px] font-normal text-white/50">{row.name}</div>
        </div>
      </div>

      <span role="gridcell" className="tnum truncate text-right text-[13px] font-semibold">
        {row.price}
      </span>

      <span
        role="gridcell"
        className={`tnum truncate text-right text-[12.5px] font-semibold ${CHANGE_TONE[row.changeDirection]}`}
      >
        {row.change24h}
      </span>

      <span
        role="gridcell"
        className="tnum truncate text-right font-serif text-[11px] font-medium text-white/50"
      >
        {row.metric}
      </span>
    </div>
  );
}
