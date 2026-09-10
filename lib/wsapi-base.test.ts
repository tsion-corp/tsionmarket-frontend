import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { normalizeWsapiBaseUrl, wsapiService, getWsapiBase } from "./wsapi-base";

describe("wsapi-base", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.WSAPI_BASE_URL;
    delete process.env.NEXT_PUBLIC_WSAPI_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("normalizeWsapiBaseUrl", () => {
    it("defaults to https://api.tsionark.com when input is empty", () => {
      expect(normalizeWsapiBaseUrl()).toBe("https://api.tsionark.com");
      expect(normalizeWsapiBaseUrl("")).toBe("https://api.tsionark.com");
      expect(normalizeWsapiBaseUrl(null)).toBe("https://api.tsionark.com");
    });

    it("strips trailing slashes", () => {
      expect(normalizeWsapiBaseUrl("https://api.tsionark.com/")).toBe("https://api.tsionark.com");
      expect(normalizeWsapiBaseUrl("https://api.tsionark.com///")).toBe("https://api.tsionark.com");
    });

    it("strips trailing /v1 to avoid doubling up", () => {
      expect(normalizeWsapiBaseUrl("https://api.tsionark.com/v1")).toBe("https://api.tsionark.com");
      expect(normalizeWsapiBaseUrl("https://api.tsionark.com/v1/")).toBe(
        "https://api.tsionark.com"
      );
      expect(normalizeWsapiBaseUrl("https://api.worldstreetwebservices.com/v1")).toBe(
        "https://api.worldstreetwebservices.com"
      );
    });

    it("handles whitespace padding", () => {
      expect(normalizeWsapiBaseUrl("  https://api.tsionark.com  ")).toBe(
        "https://api.tsionark.com"
      );
    });
  });

  describe("getWsapiBase & wsapiService", () => {
    it("derives from NEXT_PUBLIC_WSAPI_BASE_URL if set", () => {
      process.env.NEXT_PUBLIC_WSAPI_BASE_URL = "https://staging.tsionark.com";
      expect(getWsapiBase()).toBe("https://staging.tsionark.com");
      expect(wsapiService("trade")).toBe("https://staging.tsionark.com/v1/trade");
    });

    it("derives from WSAPI_BASE_URL if NEXT_PUBLIC is absent", () => {
      process.env.WSAPI_BASE_URL = "https://custom.tsionark.com";
      expect(getWsapiBase()).toBe("https://custom.tsionark.com");
      expect(wsapiService("perp")).toBe("https://custom.tsionark.com/v1/perp");
    });

    it("handles leading slashes in service argument cleanly", () => {
      process.env.WSAPI_BASE_URL = "https://api.tsionark.com";
      expect(wsapiService("/kash")).toBe("https://api.tsionark.com/v1/kash");
    });
  });
});
