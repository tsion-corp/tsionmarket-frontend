import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

// A shared link carries ?ref=<code> on whatever page it points at. Nothing read
// it before: only /r/<code> set the cookie, so attaching a code to a market or
// a game link attributed nobody (kash ADR-0015).

function visit(url: string, cookie?: string) {
  const request = new NextRequest(new URL(url));
  if (cookie) request.cookies.set("ark_ref", cookie);
  return proxy(request);
}

// Stubbed here and cleared after, never cleared first: unstubbing at the START
// of a test wipes whatever another file had set, which is what made
// lib/market-square fail in a batch run and pass on its own.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_LAUNCH_AT", "");
  vi.stubEnv("MAINTENANCE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a referral code on a shared link", () => {
  it("is stored from any page, not just the invite route", () => {
    const res = visit("https://tsionark.com/casino/last-standing/274?ref=7k4m9x2p");
    expect(res.cookies.get("ark_ref")?.value).toBe("7k4m9x2p");
  });

  it("is stripped from the address, so the visitor cannot pass it on", () => {
    const res = visit("https://tsionark.com/prediction?ref=7k4m9x2p");
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("/prediction");
    expect(location).not.toContain("ref=");
  });

  it("keeps the rest of the query, which campaign tags ride in", () => {
    const res = visit("https://tsionark.com/prediction?ref=7k4m9x2p&utm_source=x");
    expect(res.headers.get("Location")).toContain("utm_source=x");
  });

  it("takes a username too", () => {
    expect(visit("https://tsionark.com/spot?ref=alice").cookies.get("ark_ref")?.value).toBe(
      "alice"
    );
  });

  it("lower-cases what it was given", () => {
    expect(visit("https://tsionark.com/spot?ref=7K4M9X2P").cookies.get("ark_ref")?.value).toBe(
      "7k4m9x2p"
    );
  });

  // The referral belongs to whoever brought this visitor first; a later link
  // must not take it off them.
  it("never overwrites a code the visitor already carries", () => {
    const res = visit("https://tsionark.com/spot?ref=7k4m9x2p", "alice");
    expect(res.cookies.get("ark_ref")).toBeUndefined();
    expect(res.headers.get("Location")).not.toContain("ref=");
  });

  it("stores nothing for a code that is neither kind", () => {
    const res = visit("https://tsionark.com/spot?ref=0x85178feb764f92a919ff49717d9b493aa4f55784");
    expect(res.cookies.get("ark_ref")).toBeUndefined();
  });

  // The matcher covers /api too, and a redirect there breaks the call rather
  // than crediting anyone. A referral arrives on a page somebody opened.
  it("never redirects an api request", () => {
    const res = visit("https://tsionark.com/api/kash/referrals/me?ref=7k4m9x2p");
    expect(res.headers.get("Location")).toBeNull();
    expect(res.cookies.get("ark_ref")).toBeUndefined();
  });

  it("leaves a page with no ref alone", () => {
    const res = visit("https://tsionark.com/spot");
    expect(res.headers.get("Location")).toBeNull();
    expect(res.cookies.get("ark_ref")).toBeUndefined();
  });
});
