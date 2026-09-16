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
  it("pins portfolio first and leads with the chosen interest", () => {
    const order = orderedSections("meme");
    expect(order[0]).toBe("portfolio");
    expect(order[1]).toBe("meme");
    expect(new Set(order).size).toBe(order.length);
  });

  // Production hides perpetuals (#382). Staging is where the desk is
  // exercised, so here it is in the nav and the perps interest leads with it.
  it("offers perpetuals in the navigation on staging", () => {
    expect(orderedSections(null)).toContain("perps");
    expect(orderedSections("perps")[1]).toBe("perps");
    expect(sectionForPathname("/perps")).toBe("perps");
  });
});

// Production hides real assets for now; staging shows them, and the
// interests that point at them lead with them.
describe("real assets in the navigation on staging", () => {
  it("is offered, and led with for the interests that point at it", () => {
    expect(orderedSections(null)).toContain("rwa");
    for (const interest of ["stocks", "gold", "yield", "realestate", "treasuries"]) {
      expect(orderedSections(interest)[1]).toBe("rwa");
    }
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
    expect(orderedSections(null)).not.toContain("square");
  });
});
