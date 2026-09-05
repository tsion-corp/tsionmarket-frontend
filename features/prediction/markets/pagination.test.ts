import { describe, expect, it } from "vitest";
import type { ComboEventsPage } from "./api";
import { nextEventCursor } from "./pagination";

function page(events: ComboEventsPage["events"], nextCursor: string | null): ComboEventsPage {
  return { sport: "soccer", league: null, events, nextCursor };
}

describe("nextEventCursor", () => {
  const event = { id: "fixture-1" } as ComboEventsPage["events"][number];

  it("continues past a filtered empty page when the provider has another cursor", () => {
    expect(nextEventCursor(page([], "next"), [null])).toBe("next");
  });

  it("stops when the provider reports no next cursor", () => {
    expect(nextEventCursor(page([], null), [null])).toBeUndefined();
  });

  it("stops when the provider repeats a requested cursor", () => {
    expect(nextEventCursor(page([event], "same"), [null, "same"])).toBeUndefined();
  });

  it("continues for a non-empty page with a new cursor", () => {
    expect(nextEventCursor(page([event], "next"), [null])).toBe("next");
  });
});
