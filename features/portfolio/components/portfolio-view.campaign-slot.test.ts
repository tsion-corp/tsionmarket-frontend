import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The view takes the campaign banner through a slot, because it belongs to
// the casino feature and features never import each other. It renders once
// per layout, above the balance row, so the phone deck and the desktop grid
// both open with it.
describe("PortfolioView campaign slot", () => {
  const source = readFileSync(join(__dirname, "portfolio-view.tsx"), "utf8");

  it("takes the banner as a slot", () => {
    expect(source).toMatch(/campaignSlot\?: ReactNode/);
  });

  it("renders it above the balance row in both layouts", () => {
    const phone = source.indexOf("<BalanceCarousel>");
    const desk = source.indexOf("{/* Desktop: the side-by-side grid. */}");
    const slots = [...source.matchAll(/\{campaignSlot\}/g)].map((m) => m.index ?? -1);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toBeLessThan(phone);
    expect(slots[1]).toBeGreaterThan(phone);
    expect(slots[1]).toBeLessThan(desk + 200);
  });
});
