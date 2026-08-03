import { describe, it, expect } from "vitest";
import { parentRoute } from "@/components/dashboard/earn/earn-page";

// The back link used to drop one path segment, which pointed the listing
// screens at /earn/sponsor/listing and /earn/listing. Neither has a page, so
// following the link 404d. It now skips to the nearest route that exists.

describe("earn back link", () => {
  it("returns a sponsor listing to the company, not the segment above it", () => {
    expect(parentRoute("/earn/sponsor/listing/new")).toEqual({
      href: "/earn/sponsor",
      label: "Your company",
    });
    expect(parentRoute("/earn/sponsor/listing/test-listing")).toEqual({
      href: "/earn/sponsor",
      label: "Your company",
    });
  });

  it("returns a public listing to the feed", () => {
    expect(parentRoute("/earn/listing/test-listing")).toEqual({ href: "/earn", label: "Earn" });
  });

  it("returns sponsor onboarding to the company", () => {
    expect(parentRoute("/earn/sponsor/new")).toEqual({
      href: "/earn/sponsor",
      label: "Your company",
    });
  });

  it("returns the company itself to the feed", () => {
    expect(parentRoute("/earn/sponsor")).toEqual({ href: "/earn", label: "Earn" });
  });

  it("cannot go above the feed", () => {
    expect(parentRoute("/earn")).toEqual({ href: "/earn", label: "Earn" });
  });

  it("sends a route it does not know back to the feed rather than a dead path", () => {
    expect(parentRoute("/earn/something/else")).toEqual({ href: "/earn", label: "Earn" });
  });
});
