"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { tokenBg } from "@/lib/trade/assets";

// Which way the 24h number moved. The caller owns the underlying figure and
// decides the direction, so this table never compares numbers of its own.
export type SpotChangeDirection = "up" | "down" | "flat";

// One row of the spot asset table, display-ready. Price, change and market cap
// arrive as finished strings: this component formats nothing and does no
// arithmetic, which keeps money maths out of the presentation layer entirely.
export interface SpotAssetRowView {
  // Stable identity, and what onSelect reports back. Usually the symbol, but a
  // contract address works when two markets share a ticker.
  id: string;
  symbol: string;
  // The full token name shown under the ticker.
  name: string;
  // Remote logo URL, or null to fall back to the built-in icon set.
  logo: string | null;
  price: string;
  change24h: string;
  changeDirection: SpotChangeDirection;
  marketCap: string;
}

// Column track shared by the header and every row, so the two stay aligned,
// including the horizontal inset: the design is not symmetric, it leaves about
// 15px on the left and 26px on the right, which is what pulls the market cap
// column off the panel edge. The three numeric columns are fixed pixel widths
// taken from the Figma frame so their right edges hold still while the asset
// column absorbs any change in panel width.
export const SPOT_ASSET_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_95px_130px_146px] items-center pr-[25px] pl-[14px]";

const CHANGE_TONE: Record<SpotChangeDirection, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-white/55",
};

interface SpotAssetRowProps {
  row: SpotAssetRowView;
  selected: boolean;
  onSelect?: (id: string) => void;
}

export function SpotAssetRow({ row, selected, onSelect }: SpotAssetRowProps) {
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
      className={`${SPOT_ASSET_COLUMNS} border-rule cursor-pointer border-b py-3 leading-[1.2] transition-colors outline-none last:border-b-0 hover:bg-white/4 focus-visible:bg-white/6 ${
        selected ? "bg-white/6" : ""
      }`}
    >
      <div role="gridcell" className="flex min-w-0 items-center gap-3">
        {/* The chip behind the mark. A brand-coloured token (BTC's orange, say)
            paints its own circle inside this, so no per-asset colour is written
            here: it arrives with the icon or the logo image. */}
        <span className="bg-grey-900 grid size-[33px] shrink-0 place-items-center overflow-hidden rounded-[11px]">
          <AssetIcon
            sym={row.symbol}
            bg={tokenBg(row.symbol)}
            logo={row.logo}
            size={33}
            fallback="gradient"
          />
        </span>
        <div className="min-w-0">
          <div className="truncate font-serif text-[13.5px] font-medium text-white">
            {row.symbol}
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
        {row.marketCap}
      </span>
    </div>
  );
}
