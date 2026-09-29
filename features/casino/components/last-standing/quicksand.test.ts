import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The Last Man's design sets two faces on one card: Mona Sans for the display
// and the numbers, Quicksand Bold for the round label, the leader bar, the
// status pills, the tab strip and every cell of the activity table.
//
// A missing font is the one styling bug nothing catches. jsdom reports no
// computed family, the build does not fail, and the screen simply renders in
// the body face — which is exactly what it did before this was wired up, and
// what a reviewer reading the diff would not see either. So the wiring is
// asserted here instead: the font is loaded, the utility is defined against
// its variable, and the components that should ask for it do.

const root = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const layout = read("app/layout.tsx");
const globals = read("app/globals.css");
const stageCard = read("features/casino/components/last-standing/stage-card.tsx");
const activityPanel = read("features/casino/components/last-standing/activity-panel.tsx");
const railCards = read("features/casino/components/last-standing/rail-cards.tsx");

describe("the Quicksand wiring", () => {
  // A file in the repo, not a fetch from Google: the build is hermetic, and
  // the face is the one we shipped. See app/layout.fonts.test.ts.
  it("loads Quicksand from its file in app/fonts", () => {
    expect(layout).toMatch(/const quicksand = localFont\(\{/);
    expect(layout).toMatch(/src: "\.\/fonts\/quicksand-latin\.woff2"/);
  });

  // One variable file carries every weight; the range it declares must reach
  // the bold the utility asks for, or CSS clamps the request short of it.
  it("declares a range that reaches bold, under the variable the utility reads", () => {
    const declaration = layout.slice(layout.indexOf("const quicksand = localFont({"));
    const range = declaration.match(/weight: "(\d+) (\d+)"/);
    expect(range).not.toBeNull();
    expect(Number(range?.[1])).toBeLessThanOrEqual(700);
    expect(Number(range?.[2])).toBeGreaterThanOrEqual(700);
    expect(declaration).toMatch(/variable: "--font-quicksand"/);
  });

  // Declaring the variable is not enough: next/font only serves the face on
  // elements under the class it hands back.
  it("puts the font's class on the document", () => {
    expect(layout).toMatch(/\$\{quicksand\.variable\}/);
  });

  it("defines ws-quick against that variable, at bold", () => {
    const utility = globals.slice(globals.indexOf("@utility ws-quick"));
    expect(utility).toMatch(/font-family: var\(--font-quicksand\)/);
    expect(utility).toMatch(/font-weight: 700/);
  });

  it.each([
    ["the stage card's round label, leader bar and badge", stageCard, 3],
    ["the activity panel's tabs and table", activityPanel, 2],
    ["the rail's status pills", railCards, 1],
  ])("%s ask for it", (_name, source, atLeast) => {
    expect((source.match(/ws-quick/g) ?? []).length).toBeGreaterThanOrEqual(atLeast);
  });

  // A weight class on the same element wins over the utility's own, which is
  // how the table ended up at 500 while the design asked for 700.
  it("leaves no weight class on the elements that carry it", () => {
    for (const source of [stageCard, activityPanel, railCards]) {
      for (const line of source.split("\n")) {
        if (!line.includes("ws-quick")) continue;
        expect(line).not.toMatch(/font-(thin|light|normal|medium|semibold|bold|extrabold|black)\b/);
      }
    }
  });
});
