import { describe, expect, it } from "vitest";
import { arkBroadcastTarget, surfaceName } from "./ark-target";

describe("surfaceName", () => {
  it("names the Ark surface a path is on", () => {
    expect(surfaceName("/prediction")).toBe("Prediction");
    expect(surfaceName("/rwa")).toBe("Rwa");
    expect(surfaceName("/casino/chess/play?match=m-1")).toBe("Chess");
    expect(surfaceName("/casino")).toBe("Arkade");
  });

  it("calls the dashboard and the root simply Ark", () => {
    expect(surfaceName("/dashboard")).toBe("Ark");
    expect(surfaceName("/")).toBe("Ark");
  });

  it("reads a hyphenated route as words", () => {
    expect(surfaceName("/casino/last-standing/42")).toBe("Last Standing");
  });
});

describe("arkBroadcastTarget", () => {
  it("carries no deep link, because a trade is not a game", () => {
    // kind "game" would route a viewer into the casino for a stream about a
    // bond, and Market Square treats a game stream as watch-only.
    expect(arkBroadcastTarget("/prediction", "Ada").deepLink).toBeNull();
  });

  it("points the watch link at the exact route the broadcaster was on", () => {
    expect(arkBroadcastTarget("/casino/chess/play?match=m-1", null).watchPath).toBe(
      "/casino/chess/play?match=m-1"
    );
  });

  it("names the broadcaster and the surface in the title", () => {
    expect(arkBroadcastTarget("/prediction", "Ada").title).toBe("Ada on Ark — Prediction");
    expect(arkBroadcastTarget("/prediction", null).title).toBe("Live on Ark — Prediction");
    expect(arkBroadcastTarget("/prediction", "  ").title).toBe("Live on Ark — Prediction");
  });

  it("publishes a trading screen for framerate, not for a sharp still", () => {
    expect(arkBroadcastTarget("/spot", null).content).toBe("motion");
  });
});
