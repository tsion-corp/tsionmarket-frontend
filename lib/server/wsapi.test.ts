import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Staging rides the production gateway for every service except the few that
 * have their own staging deployments: perps, chess and arkjet. Perps is the
 * one reached through this module, so it has to honour its own base URL
 * rather than follow WSAPI_BASE. Without the override, moving staging's base
 * to production silently moved perps with it (2026-09-14).
 */
describe("wsapiPerpRequest base", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function capturePerpUrl(): Promise<string> {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      seen.push(typeof input === "string" || input instanceof URL ? String(input) : input.url);
      return new Response("{}", { status: 200 });
    });
    const { wsapiPerpRequest } = await import("@/lib/server/wsapi");
    await wsapiPerpRequest("ark/assets", { method: "GET" });
    return seen[0] ?? "";
  }

  it("uses PERP_API_BASE_URL when it is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_WSAPI_BASE_URL", "https://api.example.com");
    vi.stubEnv("PERP_API_BASE_URL", "https://staging.example.com");
    expect(await capturePerpUrl()).toBe("https://staging.example.com/v1/perp/ark/assets");
  });

  it("falls back to the shared gateway when it is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_WSAPI_BASE_URL", "https://api.example.com");
    vi.stubEnv("PERP_API_BASE_URL", "");
    expect(await capturePerpUrl()).toBe("https://api.example.com/v1/perp/ark/assets");
  });
});
