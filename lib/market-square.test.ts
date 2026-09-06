import { afterEach, describe, expect, it, vi } from "vitest";

// The module reads its environment at import time, so each case imports it
// fresh under the environment it describes.
async function loadWith(env: { url?: string; live?: string }) {
  vi.resetModules();
  if (env.url === undefined) vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_URL", "");
  else vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_URL", env.url);
  if (env.live === undefined) vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_LIVE", "");
  else vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_LIVE", env.live);
  return import("./market-square");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("marketSquareHref", () => {
  it("returns null when the deployment has no Market Square, so no dead link renders", async () => {
    const { marketSquareHref } = await loadWith({});
    expect(marketSquareHref()).toBeNull();
    expect(marketSquareHref("live")).toBeNull();
  });

  it("joins a path onto the configured deployment", async () => {
    const { marketSquareHref } = await loadWith({ url: "https://square.example/" });
    expect(marketSquareHref()).toBe("https://square.example");
    expect(marketSquareHref("/live")).toBe("https://square.example/live");
  });
});

describe("MARKET_SQUARE_HIDDEN", () => {
  it("shows the square wherever its deployment is configured", async () => {
    const { MARKET_SQUARE_HIDDEN } = await loadWith({ url: "https://square.example" });
    expect(MARKET_SQUARE_HIDDEN).toBe(false);
  });

  it("closes the square on the explicit off switch", async () => {
    const { MARKET_SQUARE_HIDDEN } = await loadWith({
      url: "https://square.example",
      live: "false",
    });
    expect(MARKET_SQUARE_HIDDEN).toBe(true);
  });

  it("treats any other value as on, so a typo cannot close it", async () => {
    const { MARKET_SQUARE_HIDDEN } = await loadWith({
      url: "https://square.example",
      live: "off",
    });
    expect(MARKET_SQUARE_HIDDEN).toBe(false);
  });

  it("stays hidden without a deployment to link to, whatever the switch says", async () => {
    const { MARKET_SQUARE_HIDDEN } = await loadWith({ live: "true" });
    expect(MARKET_SQUARE_HIDDEN).toBe(true);
  });
});
