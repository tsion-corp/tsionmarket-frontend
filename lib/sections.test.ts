import { describe, expect, it } from "vitest";
import { SECTION_ROUTES, orderedSections, sectionForPathname } from "@/lib/sections";

describe("sectionForPathname", () => {
  it("maps each section route to its section", () => {
    for (const [id, route] of Object.entries(SECTION_ROUTES)) {
      expect(sectionForPathname(route)).toBe(id);
    }
  });

  it("treats a nested path as part of its section", () => {
    expect(sectionForPathname("/prediction/event/abc-123")).toBe("prediction");
    expect(sectionForPathname("/casino/chess/play")).toBe("casino");
    expect(sectionForPathname("/earn/listing/foo")).toBe("earn");
  });

  it("does not match a route by a shared prefix of its name", () => {
    // /spotlight is not the spot section.
    expect(sectionForPathname("/spotlight")).toBe("portfolio");
  });

  it("falls back to the account home", () => {
    expect(sectionForPathname("/dashboard")).toBe("portfolio");
    expect(sectionForPathname("/")).toBe("portfolio");
    expect(sectionForPathname(null)).toBe("portfolio");
  });
});

describe("orderedSections", () => {
  it("pins portfolio first and leads with the chosen interest", () => {
    const order = orderedSections("meme");
    expect(order[0]).toBe("portfolio");
    expect(order[1]).toBe("meme");
    expect(new Set(order).size).toBe(order.length);
  });

  it("leaves perpetuals out of the navigation, like earn", () => {
    // The desk stays reachable at /perps; it is only not offered from the
    // rail, the tab bar, the marquee or the dashboard briefs for now.
    expect(orderedSections(null)).not.toContain("perps");
    expect(orderedSections("perps")).not.toContain("perps");
  });

  it("falls back to the default order for the perps interest", () => {
    expect(orderedSections("perps")).toEqual(orderedSections(null));
  });
});
