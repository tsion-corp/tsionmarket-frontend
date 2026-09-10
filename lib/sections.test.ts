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
