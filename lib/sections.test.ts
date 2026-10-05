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
    expect(sectionForPathname("/portfolio")).toBe("portfolio");
    expect(sectionForPathname("/dashboard")).toBe("portfolio");
    expect(sectionForPathname("/")).toBe("portfolio");
    expect(sectionForPathname(null)).toBe("portfolio");
  });
});

describe("orderedSections", () => {
  it("pins portfolio first, then the rest in their default order", () => {
    const order = orderedSections();
    expect(order[0]).toBe("portfolio");
    expect(new Set(order).size).toBe(order.length);
    expect(order).toContain("perps");
    expect(order).toContain("rwa");
    expect(sectionForPathname("/perps")).toBe("perps");
  });
});

// The Market Square page. Its rail entry keeps its own seat between Prediction
// and Arkade rather than joining the reorderable list, so the section is a
// route fact for the highlight and nothing more.
describe("the square section", () => {
  it("is a section whose route is /square", () => {
    expect(SECTION_ROUTES.square).toBe("/square");
    expect(sectionForPathname("/square")).toBe("square");
  });

  it("stays out of the reorderable list, which the rail seats by hand", () => {
    expect(orderedSections()).not.toContain("square");
  });
});
