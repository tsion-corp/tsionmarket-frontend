import type { AssetRowView, ChangeDirection } from "@/components/ui/asset-table-row";
import { assetPriceUsd, rwaLogoUrl } from "@/features/rwa/lib/api";
import {
  assetLiquidityUsd,
  formatApy,
  formatChange,
  formatCompactUsd,
  gradientFor,
  type RwaAssetView,
} from "@/features/rwa/lib/presenter";
import { formatUsd } from "@/lib/trade/math";

// One real asset as the desk's table wants it: finished strings, nothing to
// format downstream. Pure, so the mapping of a missing figure to a dash is
// tested here rather than inferred from a rendered row.
//
// `apy` is carried beside the row rather than inside it because the shared row
// takes its badge as a node, and a lib module stays free of JSX. The table
// component turns this string into the pill.
export interface RwaRowView extends Omit<AssetRowView, "badge"> {
  apy: string | null;
}

// An exact zero and an unknown move are both flat: neither is a gain, and
// painting them green would say something the data does not. The same rule the
// spot desk applies, so the two tables tone a row the same way.
function changeDirection(pct?: number): ChangeDirection {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}

// The registry serves a price for almost no asset, and the price feed fills the
// rest, so any of the three numeric columns can be missing. Each falls back to
// a dash on its own: a row with no 24h reading still shows its price.
export function toRwaRowView(asset: RwaAssetView, logo?: string): RwaRowView {
  const price = assetPriceUsd(asset);
  return {
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    logo: logo ?? rwaLogoUrl(asset),
    bg: gradientFor(asset.symbol),
    price: price != null ? formatUsd(price) : "—",
    change24h: formatChange(asset.market?.change24h) ?? "—",
    changeDirection: changeDirection(asset.market?.change24h),
    // Liquidity, not market cap. Market cap is populated for almost no real
    // asset, so the column would be a dash on most rows; live DEX liquidity is
    // the figure this domain treats as real. formatCompactUsd already returns
    // the dash for a missing or non-positive value.
    metric: formatCompactUsd(assetLiquidityUsd(asset)),
    apy: formatApy(asset.yieldApyBps),
  };
}
