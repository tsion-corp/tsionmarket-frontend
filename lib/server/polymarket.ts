import "server-only";
import { z } from "zod";
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

// Gamma is a public API with no envelope and no contract we control, so the
// payload is validated here, at the proxy boundary, before anything downstream
// sees it. The schemas are loose on purpose: they pin the type of every field
// this module reads and ignore the rest, so Gamma adding a field is not an
// outage. Every field is optional because Gamma genuinely omits them.
const gammaTagSchema = z.object({ label: z.string().optional() }).loose();

const gammaMarketSchema = z
  .object({
    question: z.string().optional(),
    // JSON-encoded arrays, parallel to each other: outcome names, their prices,
    // and their CLOB token ids. Gamma sends them as strings, not arrays.
    outcomes: z.string().optional(),
    outcomePrices: z.string().optional(),
    clobTokenIds: z.string().optional(),
    volumeNum: z.number().optional(),
    conditionId: z.string().optional(),
    // Market artwork (S3 URLs). image is the wide banner; icon the square badge.
    image: z.string().optional(),
    icon: z.string().optional(),
  })
  .loose();

const gammaEventSchema = z
  .object({
    // Gamma's own event id. It is the key the market detail route is built on,
    // so it is the one identifier here that can open a page. Gamma sends it as
    // a decimal string, but a number would deserialize just as happily, so both
    // are accepted and normalized below.
    id: z.union([z.string(), z.number()]).optional(),
    volume: z.number().optional(),
    tags: z.array(gammaTagSchema).optional(),
    markets: z.array(gammaMarketSchema).optional(),
    // Event-level artwork, used as a fallback when a market has none of its own.
    image: z.string().optional(),
    icon: z.string().optional(),
    // When the event resolves, ISO 8601 ("2026-09-15T15:30:00Z"). Gamma omits
    // it on events with no fixed date, which is why it is optional here and
    // nullable all the way down: a market with no deadline must read as having
    // none, never as a clock counting to an invented time.
    endDate: z.string().optional(),
  })
  .loose();

type GammaEvent = z.infer<typeof gammaEventSchema>;

// The response is a bare array. Its shape is checked here rather than per event
// so that a body that is not a list of events fails loudly, while a single
// event that no longer matches the contract only costs that one card.
function parseGammaEvents(body: unknown): GammaEvent[] {
  if (!Array.isArray(body)) {
    throw new Error("Polymarket events response was not an array");
  }
  const events: GammaEvent[] = [];
  const problems: string[] = [];
  for (const entry of body) {
    const result = gammaEventSchema.safeParse(entry);
    if (result.success) events.push(result.data);
    else problems.push(result.error.issues[0]?.message ?? "unknown issue");
  }
  // A dropped event is a card the desk will not show, so say so. Silence here
  // would turn a Gamma contract change into a desk that quietly gets shorter.
  if (problems.length > 0) {
    console.warn(
      `Polymarket events: dropped ${problems.length} of ${body.length} events that no longer match the Gamma contract (first: ${problems[0]})`
    );
  }
  return events;
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

// Every tag the event carries that says something about the market, in the
// order Gamma lists them, deduplicated. Order matters downstream: the feature
// that turns these into a category takes the first one it recognises, and Gamma
// lists the broadest tag first.
function tagLabels(tags?: GammaEvent["tags"]): string[] {
  const labels: string[] = [];
  for (const t of tags ?? []) {
    const label = (t.label ?? "").trim();
    if (!label || GENERIC_TAGS.has(label.toLowerCase())) continue;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

// The one tag the card prints. Long labels are skipped because the footer has
// room for a short word, not a sentence.
function pickTag(labels: string[]): string {
  return labels.find((label) => label.length <= 16) ?? "Prediction";
}

// Gamma ids are decimal strings. The market detail route rejects anything else
// outright, so an id that would not survive that check is dropped here rather
// than shipped to a card that would then link to a 404.
function parseEventId(id?: string | number): string | undefined {
  const value = typeof id === "number" ? String(id) : (id ?? "");
  return /^\d+$/.test(value) ? value : undefined;
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
    { next: { revalidate: FIVE_MINUTES }, signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) throw new Error(`Polymarket events failed: ${res.status}`);
  const events = parseGammaEvents(await res.json());

  const out: Prediction[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    if (out.length >= limit) break;
    const labels = tagLabels(ev.tags);
    const tag = pickTag(labels);
    const eventId = parseEventId(ev.id);

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
      // Left off rather than sent as 0, so a market Gamma reports no volume for
      // renders as having none instead of as having traded nothing.
      volumeUsd: market.vol > 0 ? market.vol : undefined,
      q: market.question,
      yes: `${yesCents}¢`,
      no: `${100 - yesCents}¢`,
      pct: yesCents,
      image: market.image,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      conditionId: market.conditionId,
      eventId,
      tagLabels: labels,
      endsAt: ev.endDate,
    });
  }

  return out;
}
