import { describe, expect, it } from "vitest";
import { withFeaturedFirst } from "@/lib/square/featured";

const p = (username: string) => ({ username });
const nameOf = (x: { username: string }) => x.username;

describe("withFeaturedFirst", () => {
  it("moves a pinned profile to the front", () => {
    const list = [p("amina"), p("bode"), p("ogazboiz"), p("chidi")];
    expect(withFeaturedFirst(list, nameOf, ["ogazboiz"]).map(nameOf)).toEqual([
      "ogazboiz",
      "amina",
      "bode",
      "chidi",
    ]);
  });

  // "Put X first" must mean first even when X has fewer followers than Y.
  it("keeps pinned profiles in the ORDER LISTED, not the order returned", () => {
    const list = [p("bode"), p("ogazboiz")];
    expect(withFeaturedFirst(list, nameOf, ["ogazboiz", "bode"]).map(nameOf)).toEqual([
      "ogazboiz",
      "bode",
    ]);
  });

  it("ignores case and a leading @", () => {
    const list = [p("Amina"), p("OgazBoiz")];
    expect(withFeaturedFirst(list, nameOf, ["ogazboiz"]).map(nameOf)[0]).toBe("OgazBoiz");
  });

  // A pin that is not in the fetched page must not leave a hole.
  it("skips a pinned name that is absent", () => {
    const list = [p("amina"), p("bode")];
    expect(withFeaturedFirst(list, nameOf, ["nobody"]).map(nameOf)).toEqual(["amina", "bode"]);
  });

  it("leaves the order untouched when nothing is pinned", () => {
    const list = [p("amina"), p("bode")];
    expect(withFeaturedFirst(list, nameOf, []).map(nameOf)).toEqual(["amina", "bode"]);
  });
});
