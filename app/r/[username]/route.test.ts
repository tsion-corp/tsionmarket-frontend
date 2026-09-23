import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// A referral link sends the visitor on to sign-in. Whatever campaign tags the
// link carried have to survive that hop: Mixpanel reads them off the page the
// visitor lands on, and a link that drops them shows up as "direct".

function open(url: string, username: string) {
  return GET(new NextRequest(new URL(url)), { params: Promise.resolve({ username }) });
}

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
