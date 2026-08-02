import { describe, it, expect } from "vitest";
import { parentRoute } from "@/components/dashboard/casino/casino-page";

// Back goes up one level. Jumping straight to the hub from a game skipped the
// lobby the game was started from, which is where anyone leaving a board
// actually wants to land.

describe("casino back link", () => {
  it("returns a game to the chess lobby, not the hub", () => {
    expect(parentRoute("/casino/chess/play")).toEqual({ href: "/casino/chess", label: "Chess" });
    expect(parentRoute("/casino/chess/watch")).toEqual({ href: "/casino/chess", label: "Chess" });
    expect(parentRoute("/casino/chess/tournament")).toEqual({
      href: "/casino/chess",
      label: "Chess",
    });
  });

  it("returns the chess lobby itself to the hub", () => {
    expect(parentRoute("/casino/chess")).toEqual({ href: "/casino", label: "Arkade" });
  });

  it("works the same for the other games", () => {
    expect(parentRoute("/casino/draw/entries")).toEqual({ href: "/casino/draw", label: "Draw" });
    expect(parentRoute("/casino/last-standing")).toEqual({ href: "/casino", label: "Arkade" });
  });

  it("names an unlisted parent from its own path", () => {
    expect(parentRoute("/casino/some-new-game/detail")).toEqual({
      href: "/casino/some-new-game",
      label: "Some new game",
    });
  });

  it("cannot go above the hub", () => {
    expect(parentRoute("/casino")).toEqual({ href: "/casino", label: "Arkade" });
  });
});
