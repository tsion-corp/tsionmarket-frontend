import { afterEach, describe, expect, it, vi } from "vitest";

// The module reads its environment at import time, so each case imports it
// fresh under the environment it describes.
// `url: null` is the variable absent; `undefined` is it set to an empty string.
async function loadWith(env: { url?: string | null; live?: string }) {
  vi.resetModules();
  if (env.url === null) vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_URL", undefined);
  else if (env.url === undefined) vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_URL", "");
  else vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_URL", env.url);
  if (env.live === undefined) vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_LIVE", "");
  else vi.stubEnv("NEXT_PUBLIC_MARKET_SQUARE_LIVE", env.live);
  return import("./market-square");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("marketSquareHref", () => {
  // The Square is served at /square as a multi-zone, so every way in is a path
  // on THIS origin. It used to be an absolute URL on square.tsionark.com,
  // which sent the reader to another sub-domain to read something the app
  // already serves.
  it("keeps the reader on this origin, whatever deployment backs the square", async () => {
    const { marketSquareHref } = await loadWith({ url: null });
    expect(marketSquareHref()).toBe("/square");
    expect(marketSquareHref("live")).toBe("/square/live");
  });

  it("returns null when the deployment switches its Market Square off by URL, so no dead link renders", async () => {
    const { marketSquareHref } = await loadWith({});
    expect(marketSquareHref()).toBeNull();
    expect(marketSquareHref("live")).toBeNull();
  });

  // The configured URL still decides WHETHER there is a square (and backs the
  // zone rewrite in next.config), but it is no longer the link's base.
  it("joins a path onto the zone, not onto the configured deployment", async () => {
    const { marketSquareHref } = await loadWith({ url: "https://square.example/" });
    expect(marketSquareHref()).toBe("/square");
    expect(marketSquareHref("/live")).toBe("/square/live");
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

  it("stays hidden with the URL emptied, whatever the switch says", async () => {
    const { MARKET_SQUARE_HIDDEN } = await loadWith({ live: "true" });
    expect(MARKET_SQUARE_HIDDEN).toBe(true);
  });

  it("is shown by default, linking to the production square", async () => {
    const { MARKET_SQUARE_HIDDEN } = await loadWith({ url: null });
    expect(MARKET_SQUARE_HIDDEN).toBe(false);
  });
});

describe("SQUARE_SECTIONS_HIDDEN", () => {
  it("keeps the in-app sections off while the rail still links out to the square", async () => {
    const { MARKET_SQUARE_HIDDEN, SQUARE_SECTIONS_HIDDEN } = await loadWith({
      url: "https://square.example",
    });
    // The two switches are independent: a configured square is reachable from
    // the rail, and its sections still do not render inside this app.
    expect(MARKET_SQUARE_HIDDEN).toBe(false);
    expect(SQUARE_SECTIONS_HIDDEN).toBe(true);
  });

  it("cannot be turned back on from the environment", async () => {
    const { SQUARE_SECTIONS_HIDDEN } = await loadWith({
      url: "https://square.example",
      live: "true",
    });
    expect(SQUARE_SECTIONS_HIDDEN).toBe(true);
  });

  it("stays off under the operator takedown, which closes every surface", async () => {
    const { MARKET_SQUARE_HIDDEN, SQUARE_SECTIONS_HIDDEN } = await loadWith({
      url: "https://square.example",
      live: "false",
    });
    expect(MARKET_SQUARE_HIDDEN).toBe(true);
    expect(SQUARE_SECTIONS_HIDDEN).toBe(true);
  });
});
