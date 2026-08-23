import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectRequestCountry } from "@/lib/server/ipinfo";

beforeEach(() => {
  vi.stubEnv("IPINFO_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("IPinfo country detection", () => {
  it("uses a trusted edge country without calling IPinfo", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const country = await detectRequestCountry(new Headers({ "x-vercel-ip-country": "ng" }));

    expect(country).toBe("NG");
    expect(request).not.toHaveBeenCalled();
  });

  it("looks up the first public forwarded IP with the server token", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ country_code: "NG" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const country = await detectRequestCountry(
      new Headers({ "x-forwarded-for": "197.210.53.1, 10.0.0.2" })
    );

    expect(country).toBe("NG");
    expect(request).toHaveBeenCalledWith(
      "https://api.ipinfo.io/lite/197.210.53.1",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-token" }),
      })
    );
  });

  it("uses the development machine's public egress for a loopback request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ country_code: "NG" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    expect(await detectRequestCountry(new Headers({ "x-forwarded-for": "::1" }))).toBe("NG");
    expect(request).toHaveBeenCalledWith(
      "https://api.ipinfo.io/lite/me",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("does not block joining when IPinfo is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      await detectRequestCountry(new Headers({ "x-forwarded-for": "197.210.53.2" }))
    ).toBeNull();
  });
});
