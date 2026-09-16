import { describe, expect, it } from "vitest";
import { liveEventsFrom } from "@/lib/dashboard-feed";

const NOW = 1_800_000_000;

describe("liveEventsFrom", () => {
  it("is empty when the live section is unavailable", () => {
    expect(liveEventsFrom(null, NOW)).toEqual([]);
  });

  // Last Man rounds lead the list, in feed order, with expired clocks dropped
  // here rather than by the server: that is what lets the browser re-run this
  // on a timer without asking again. Chess follows.
  it("chips the rounds and matches the app can open", () => {
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
    expect(events.map((e) => e.key)).toEqual(["lastman-7", "lastman-5", "chess-c1"]);
    expect(events[0].href).toBe("/casino/last-standing/7");
    expect(events[0].pot).toBe("$300.00");
    expect(events[2].href).toBe("/casino/chess/watch?match=c1");
  });
});

// The marquee must not advertise a game the hub does not list: Checkers is
// not offered on production, so a chip linking to /casino/checkers/play would
// be a way into a game with no tile.
describe("live events with Checkers not offered", () => {
  it("carries no Checkers chip even when the service reports live matches", () => {
    const events = liveEventsFrom(
      {
        rounds: [],
        chess: [{ id: "m1" }],
        checkers: [{ id: "d1" }, { id: "d2" }],
      } as unknown as Parameters<typeof liveEventsFrom>[0],
      1
    );

    expect(events.some((event) => event.kind === "checkers")).toBe(false);
    expect(events.map((event) => event.kind)).toEqual(["chess"]);
  });
});
