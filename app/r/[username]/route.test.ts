import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// A referral link sends the visitor on to sign-in. Whatever campaign tags the
// link carried have to survive that hop: Mixpanel reads them off the page the
// visitor lands on, and a link that drops them shows up as "direct".

function open(url: string, username: string) {
  return GET(new NextRequest(new URL(url)), { params: Promise.resolve({ username }) });
}

describe("GET /r/[code]", () => {
  // kash gives every wallet an opaque code (ADR-0015) so a link can be shared
  // by someone who never claimed a username. This route took usernames alone,
  // so those links set no cookie and attributed nobody, with no error anywhere.
  it("stores a code that starts with a digit", async () => {
    const res = await open("https://tsionark.com/r/7k4m9x2p", "7k4m9x2p");
    expect(res.cookies.get("ark_ref")?.value).toBe("7k4m9x2p");
  });

  it("stores a username, as it always did", async () => {
    const res = await open("https://tsionark.com/r/alice", "alice");
    expect(res.cookies.get("ark_ref")?.value).toBe("alice");
  });

  it("lower-cases whatever it was given", async () => {
    const res = await open("https://tsionark.com/r/7K4M9X2P", "7K4M9X2P");
    expect(res.cookies.get("ark_ref")?.value).toBe("7k4m9x2p");
  });

  // A bad code still sets nothing, so a typo cannot attribute a stranger.
  it("stores nothing for what is neither", async () => {
    for (const bad of ["ab", "has space", "0x85178feb764f92a919ff49717d9b493aa4f55784"]) {
      const res = await open(`https://tsionark.com/r/${encodeURIComponent(bad)}`, bad);
      expect(res.cookies.get("ark_ref")).toBeUndefined();
    }
  });
});

describe("GET /r/[username]", () => {
  it("keeps the link's campaign tags on the way to sign-in", async () => {
    const res = await open(
      "https://tsionark.com/r/alice?utm_source=x&utm_campaign=launch",
      "alice"
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe(
      "https://tsionark.com/auth?utm_source=x&utm_campaign=launch"
    );
  });

  it("still sets the referral code", async () => {
    const res = await open("https://tsionark.com/r/Alice", "Alice");
    expect(res.headers.get("Location")).toBe("https://tsionark.com/auth");
    expect(res.cookies.get("ark_ref")?.value).toBe("alice");
  });
});
