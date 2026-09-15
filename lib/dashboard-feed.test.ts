import { describe, expect, it } from "vitest";
import { liveEventsFrom } from "@/lib/dashboard-feed";

const NOW = 1_800_000_000;

describe("liveEventsFrom", () => {
  it("is empty when the live section is unavailable", () => {
    expect(liveEventsFrom(null, NOW)).toEqual([]);
  });

  // Last Man rounds used to lead this list, newest first, with expired clocks
  // dropped. The game is hidden on production, so the feed's rounds produce no
  // chips at all now; the chess and checkers ordering is unchanged.
  it("chips the matches the app can still open", () => {
    const events = liveEventsFrom(
      {
        rounds: [
          { gameId: 7, endTime: NOW + 60, potUsd: 300, pot: "$300.00" },
          { gameId: 3, endTime: NOW - 1, potUsd: 900, pot: "$900.00" },
          { gameId: 5, endTime: NOW + 600, potUsd: 42, pot: "$42.00" },
        ],
        chess: [{ id: "c1" }],
        checkers: [{ id: "d 1" }],
      },
      NOW
    );
    expect(events.map((e) => e.key)).toEqual(["chess-c1", "checkers-d 1"]);
    expect(events[0].href).toBe("/casino/chess/watch?match=c1");
    // Ids are URL-encoded into the watch link.
    expect(events[1].href).toBe("/casino/checkers/play?match=d%201");
  });
});

// The marquee must not advertise a game the app no longer opens: a Last Man
// chip links to /casino/last-standing/:id, which now redirects to the hub.
describe("live events with The Last Man hidden", () => {
  it("carries no Last Man chip even when the service reports live rounds", () => {
    const events = liveEventsFrom(
      {
        rounds: [{ gameId: 7, endTime: 9_999_999_999, pot: "$12.00" }],
        chess: [{ id: "m1" }],
        checkers: [],
      } as unknown as Parameters<typeof liveEventsFrom>[0],
      1
    );

    expect(events.some((event) => event.kind === "lastman")).toBe(false);
    expect(events.map((event) => event.kind)).toEqual(["chess"]);
  });
});
