import type { DiscoveryEventsPage, DiscoveryMarketEvent } from "./api";

export function mergeDiscoveryEventPages(
  pages: readonly DiscoveryEventsPage[]
): DiscoveryMarketEvent[] {
  const events = new Map<string, DiscoveryMarketEvent>();
  for (const page of pages) {
    for (const event of page.events) events.set(event.id, event);
  }
  return [...events.values()];
}
