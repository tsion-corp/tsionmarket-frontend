"use client";

import {
  AssetTableRow,
  ASSET_COLUMNS,
  type AssetRowView,
  type ChangeDirection,
} from "@/components/ui/asset-table-row";
import { tokenBg } from "@/lib/trade/assets";

// The spot desk's binding to the shared asset row. The row itself lives in
// components/ui because nothing about it is spot: it takes finished strings and
// reports a selection. What is spot is the palette the chip is drawn from and
// the name of the fourth column, and that is all this file supplies.

export type SpotChangeDirection = ChangeDirection;

export interface SpotAssetRowView {
  id: string;
  symbol: string;
  name: string;
  logo: string | null;
  price: string;
  change24h: string;
  changeDirection: SpotChangeDirection;
  marketCap: string;
}

export const SPOT_ASSET_COLUMNS = ASSET_COLUMNS;

// Market cap is the spot desk's fourth column. The shared row calls that slot
// `metric` because the real assets desk puts liquidity in it.
export function toSharedAssetRow(row: SpotAssetRowView): AssetRowView {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    logo: row.logo,
    bg: tokenBg(row.symbol),
    price: row.price,
    change24h: row.change24h,
    changeDirection: row.changeDirection,
    metric: row.marketCap,
  };
}

interface SpotAssetRowProps {
  row: SpotAssetRowView;
  selected: boolean;
  onSelect?: (id: string) => void;
}

export function SpotAssetRow({ row, selected, onSelect }: SpotAssetRowProps) {
  return <AssetTableRow row={toSharedAssetRow(row)} selected={selected} onSelect={onSelect} />;
}
