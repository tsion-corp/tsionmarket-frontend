import { describe, expect, it, vi } from "vitest";
import Page from "./page";

vi.mock("@/features/prediction/sportsbook", () => ({ SportsbookShell: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

describe("market event routing", () => {
  it.each(["politics", "crypto", "finance", "tech", "culture", "economy"])(
    "routes %s events to category details, not the sportsbook",
    async (category) => {
      const element = await Page({
        params: Promise.resolve({ eventId: "101" }),
        searchParams: Promise.resolve({ category }),
      });
      expect(element.props).toMatchObject({ eventId: "101", category });
      expect(element.props).not.toHaveProperty("requestedSport");
    }
  );

  it("opens a Polymarket sports event on the discovery detail, not the sportsbook", async () => {
    // The defect three reports named. Sports is most of what the desk shows, so
    // refusing it left the first cards on the page dead. `source=markets` is
    // what separates Gamma's event ids from the sportsbook's on this one path.
    const element = await Page({
      params: Promise.resolve({ eventId: "481717" }),
      searchParams: Promise.resolve({ category: "sports", source: "markets" }),
    });
    expect(element.props).toMatchObject({ eventId: "481717", category: "sports" });
    expect(element.props).not.toHaveProperty("requestedSport");
  });

  it("preserves sports links without a category", async () => {
    const element = await Page({
      params: Promise.resolve({ eventId: "101" }),
      searchParams: Promise.resolve({ sport: "tennis", league: "atp" }),
    });
    expect(element.props).toMatchObject({
      eventId: "101",
      requestedSport: "tennis",
      league: "atp",
    });
  });

  it("still sends a bare id to the sportsbook", async () => {
    // The marker is what changed, not the default. An id on its own is a
    // sportsbook fixture, the way every link the sportsbook builds arrives.
    const element = await Page({
      params: Promise.resolve({ eventId: "101" }),
      searchParams: Promise.resolve({}),
    });
    expect(element.props).toMatchObject({ eventId: "101", requestedSport: "football" });
  });
});
