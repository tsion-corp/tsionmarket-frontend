import { describe, expect, it } from "vitest";
import { liveEventsFrom } from "@/lib/dashboard-feed";

const NOW = 1_800_000_000;

describe("liveEventsFrom", () => {
  it("is empty when the live section is unavailable", () => {
    expect(liveEventsFrom(null, NOW)).toEqual([]);
  });

  it("orders rounds as the feed did and drops the ones whose clock ran out", () => {
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
    expect(events.map((e) => e.key)).toEqual([
      "lastman-7",
      "lastman-5",
      "chess-c1",
      "checkers-d 1",
    ]);
    expect(events[0]).toMatchObject({ href: "/casino/last-standing/7", pot: "$300.00" });
    expect(events[2].href).toBe("/casino/chess/watch?match=c1");
    // Ids are URL-encoded into the watch link.
    expect(events[3].href).toBe("/casino/checkers/play?match=d%201");
  });
});
