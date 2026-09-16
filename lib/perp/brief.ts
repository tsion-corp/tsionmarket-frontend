import { z } from "zod";
import { PERP_MAJOR_SYMBOLS } from "@/lib/perp/logic";

// The dashboard's perps brief as one pure composition, used by the dashboard
// feed on the server: the majors the desk lists, with the perp service's live
// mark where it has one and the app's own price where it does not, and the
// leverage each can be taken to.

export interface PerpBriefRow {
  /** Pair label, e.g. "BTC/USD". */
  symbol: string;
  /** Base asset, for the icon and the price fallback lookup. */
  base: string;
  priceUsd: number;
  maxLeverage: number;
}

// The fields of the perp service's `ark/assets` and `ark/market-contexts`
// rows the brief reads. The rows carry more; the brief ignores the rest.
const assetSchema = z.object({
  symbol: z.string().min(1),
  /** "" is a native perp; anything else is a HIP-3 dex the desk does not list as a major. */
  dex: z.string(),
  maxLeverage: z.number().positive(),
  isActive: z.boolean(),
});
const contextSchema = z.object({
  symbol: z.string().min(1),
  markPrice: z.string(),
});

export type PerpBriefAsset = z.infer<typeof assetSchema>;
export type PerpBriefContext = z.infer<typeof contextSchema>;

export function parsePerpBriefAssets(data: unknown): PerpBriefAsset[] {
  return z.array(assetSchema).parse(data);
}

export function parsePerpBriefContexts(data: unknown): PerpBriefContext[] {
  return z.array(contextSchema).parse(data);
}

/** The bases whose app price the brief may fall back to. */
export function perpBriefFallbackSymbols(): string[] {
  return PERP_MAJOR_SYMBOLS.map((s) => s.split("/")[0]);
}

export function composePerpBrief(
  assets: PerpBriefAsset[],
  contexts: PerpBriefContext[],
  fallback: Record<string, number>,
  count: number
): PerpBriefRow[] {
  const listed = new Map<string, PerpBriefAsset>();
  for (const a of assets) if (a.dex === "" && a.isActive) listed.set(a.symbol, a);
  const marks = new Map<string, number>();
  for (const c of contexts) {
    const mark = Number(c.markPrice);
    if (Number.isFinite(mark) && mark > 0) marks.set(c.symbol, mark);
  }

  const rows: PerpBriefRow[] = [];
  for (const symbol of PERP_MAJOR_SYMBOLS) {
    const base = symbol.split("/")[0];
    const asset = listed.get(base);
    if (!asset) continue;
    rows.push({
      symbol,
      base,
      priceUsd: marks.get(base) ?? fallback[base] ?? 0,
      maxLeverage: asset.maxLeverage,
    });
    if (rows.length === count) break;
  }
  return rows;
}
