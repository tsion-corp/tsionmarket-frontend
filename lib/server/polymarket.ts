import "server-only";
import type { Prediction } from "@/lib/types";
import { pickMarketImage } from "@/lib/prediction-image";

// Read-only Polymarket market data via the public Gamma API (the same public
// data the @polymarket/client PublicClient wraps). Cached five minutes. This is
// display-only; trading (SecureClient) is a later phase.
const FIVE_MINUTES = 300;
const GAMMA = "https://gamma-api.polymarket.com";

// Promo / housekeeping tags we never want to show as a market category.
const GENERIC_TAGS = new Set([
  "all",
  "recurring",
  "weekly",
  "monthly",
  "daily",
  "new",
  "trending",
  "featured",
  "live",
  "hide from new",
]);

interface GammaTag {
  label?: string;
}
interface GammaMarket {
  question?: string;
  outcomes?: string;
  outcomePrices?: string;
  volumeNum?: number;
  // JSON-encoded array of CLOB token IDs, parallel to `outcomes`.
  clobTokenIds?: string;
  conditionId?: string;
  // Market artwork (S3 URLs). image is the wide banner; icon the square badge.
  image?: string;
  icon?: string;
}
interface GammaEvent {
  volume?: number;
  tags?: GammaTag[];
  markets?: GammaMarket[];
  // Event-level artwork, used as a fallback when a market has none of its own.
  image?: string;
  icon?: string;
}

function parseJsonArray(raw?: string): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function pickTag(tags?: GammaTag[]): string {
  for (const t of tags ?? []) {
    const label = (t.label ?? "").trim();
    if (label && label.length <= 16 && !GENERIC_TAGS.has(label.toLowerCase())) return label;
  }
  return "Prediction";
}

function formatVol(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)} vol`;
}

// One representative binary (Yes/No) market per active event, favouring the most
// contested price so the cards read as real, meaningful odds rather than
// near-certain novelty markets.
export async function fetchPredictions(limit = 12): Promise<Prediction[]> {
  const res = await fetch(
    `${GAMMA}/events?closed=false&active=true&order=volume24hr&ascending=false&limit=60`,
    { next: { revalidate: FIVE_MINUTES } }
  );
  if (!res.ok) throw new Error(`Polymarket events failed: ${res.status}`);
  const events = (await res.json()) as GammaEvent[];

  const out: Prediction[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    if (out.length >= limit) break;
    const tag = pickTag(ev.tags);

    const candidates = (ev.markets ?? [])
      .map((m) => {
        const outcomes = parseJsonArray(m.outcomes).map((o) => o.toLowerCase());
        const prices = parseJsonArray(m.outcomePrices).map(Number);
        if (outcomes.length !== 2 || !outcomes.includes("yes") || !outcomes.includes("no")) {
          return null;
        }
        const yesIdx = outcomes.indexOf("yes");
        const noIdx = outcomes.indexOf("no");
        const yes = prices[yesIdx];
        if (!Number.isFinite(yes)) return null;
        const tokenIds = parseJsonArray(m.clobTokenIds);
        const image = pickMarketImage(m, ev);
        return {
          question: (m.question ?? "").trim(),
          yes,
          vol: m.volumeNum ?? ev.volume ?? 0,
          image,
          yesTokenId: tokenIds[yesIdx],
          noTokenId: tokenIds[noIdx],
          conditionId: m.conditionId,
        };
      })
      .filter(
        (
          m
        ): m is {
          question: string;
          yes: number;
          vol: number;
          image: string | null;
          yesTokenId: string;
          noTokenId: string;
          conditionId: string | undefined;
        } => m != null && m.question.length > 0 && m.yes >= 0.08 && m.yes <= 0.92
      )
      .sort((a, b) => Math.abs(0.5 - a.yes) - Math.abs(0.5 - b.yes));

    const market = candidates[0];
    if (!market || seen.has(market.question)) continue;
    seen.add(market.question);

    const yesCents = Math.round(market.yes * 100);
    out.push({
      tag,
      vol: formatVol(market.vol),
      q: market.question,
      yes: `${yesCents}¢`,
      no: `${100 - yesCents}¢`,
      pct: yesCents,
      image: market.image,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      conditionId: market.conditionId,
    });
  }

  return out;
}
