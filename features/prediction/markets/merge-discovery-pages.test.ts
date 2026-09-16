import { describe, expect, it } from "vitest";
import type { DiscoveryEventsPage, DiscoveryMarketEvent } from "./api";
import { mergeDiscoveryEventPages } from "./merge-discovery-pages";

function page(events: DiscoveryMarketEvent[]): DiscoveryEventsPage {
  return { category: "politics", sort: "volume_24h", events, nextCursor: null };
}

describe("mergeDiscoveryEventPages", () => {
  it("deduplicates events while preserving provider order", () => {
    const first = { id: "1", title: "First" } as DiscoveryMarketEvent;
    const updated = { id: "1", title: "Updated" } as DiscoveryMarketEvent;
    const second = { id: "2", title: "Second" } as DiscoveryMarketEvent;

    expect(mergeDiscoveryEventPages([page([first]), page([updated, second])])).toEqual([
      updated,
      second,
    ]);
  });
});
