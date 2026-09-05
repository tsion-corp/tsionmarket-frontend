import type { ComboEvent, ComboMarket } from "./api";

function mergeMarkets(current: ComboMarket[], incoming: ComboMarket[]): ComboMarket[] {
  return Array.from(
    new Map([...current, ...incoming].map((market) => [market.id, market])).values()
  );
}

export function mergeComboEventPages(pages: Array<{ events: ComboEvent[] }>): ComboEvent[] {
  const events = new Map<string, ComboEvent>();

  for (const event of pages.flatMap((page) => page.events)) {
    const current = events.get(event.id);
    if (!current) {
      events.set(event.id, event);
      continue;
    }

    events.set(event.id, {
      ...current,
      volume: event.volume ?? current.volume,
      liquidity: event.liquidity ?? current.liquidity,
      moneyline: mergeMarkets(current.moneyline, event.moneyline),
      spreads: mergeMarkets(current.spreads, event.spreads),
      totals: mergeMarkets(current.totals, event.totals),
    });
  }

  return [...events.values()];
}
