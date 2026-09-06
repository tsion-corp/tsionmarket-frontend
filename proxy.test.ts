import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function get(path: string) {
  return proxy(new NextRequest(new URL(`https://tsionark.com${path}`)));
}

const ORIGINAL = { ...process.env };

describe("proxy", () => {
  beforeEach(() => {
    delete process.env.ALLOW_ACCESS;
    delete process.env.NEXT_PUBLIC_LAUNCH_AT;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  // The state the site is in almost all of the time. A guard that is not inert
  // when open is worse than no guard.
  describe("open", () => {
    it("lets every path through when neither switch is closed", () => {
      for (const path of ["/", "/privacy", "/dashboard", "/api/kash/status"]) {
        expect(get(path).status, path).toBe(200);
      }
    });

    it("stays open once the launch time has passed", () => {
      process.env.NEXT_PUBLIC_LAUNCH_AT = new Date(Date.now() - 60_000).toISOString();
      expect(get("/dashboard").status).toBe(200);
    });

    it("ignores a launch time it cannot parse rather than closing the site", () => {
      process.env.NEXT_PUBLIC_LAUNCH_AT = "not a date";
      expect(get("/dashboard").status).toBe(200);
    });
  });

  describe("maintenance (ALLOW_ACCESS=false)", () => {
    beforeEach(() => {
      process.env.ALLOW_ACCESS = "false";
    });

    // 503 rather than a redirect to a 200: the URLs are real and coming back,
    // so a crawler must be told to retry, not that the page has moved.
    it("answers 503 on the landing page, so the notice is not indexed as the site", () => {
      const res = get("/");
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("3600");
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    });

    it("answers 503 on an app route without redirecting, so the URL survives a refresh", () => {
      const res = get("/dashboard");
      expect(res.status).toBe(503);
      expect(res.headers.get("Location")).toBeNull();
      expect(res.headers.get("x-middleware-rewrite")).toContain("/");
    });

    it("keeps the privacy policy open and indexable", () => {
      const res = get("/privacy");
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Robots-Tag")).toBeNull();
    });

    it("closes the waitlist endpoint, which the maintenance page does not use", () => {
      expect(get("/api/waitlist").status).toBe(503);
    });

    it("closes regardless of the launch clock", () => {
      process.env.NEXT_PUBLIC_LAUNCH_AT = new Date(Date.now() - 60_000).toISOString();
      expect(get("/dashboard").status).toBe(503);
    });
  });

  // Unchanged behaviour, kept because maintenance now shares this function.
  describe("pre-launch (a launch time in the future)", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_LAUNCH_AT = new Date(Date.now() + 60_000).toISOString();
    });

    it("redirects an app route to the landing page", () => {
      const res = get("/dashboard");
      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toBe("https://tsionark.com/");
    });

    it("leaves the landing page and the waitlist endpoint open", () => {
      expect(get("/").status).toBe(200);
      expect(get("/api/waitlist").status).toBe(200);
    });
  });
});
