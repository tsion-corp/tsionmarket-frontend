// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDecaneSessionCookie, syncDecaneSessionCookie } from "@/lib/decane-session-cookie";

// The cookie is scoped to Path=/api, so a document sitting at "/" cannot read
// it back — which is the point of the scoping. Assert on what is written
// instead, attributes included: they are the security posture, not decoration.
let written: string[] = [];
beforeEach(() => {
  written = [];
  vi.spyOn(document, "cookie", "set").mockImplementation((v: string) => {
    written.push(v);
  });
});

function jwt(exp: number): string {
  return `h.${btoa(JSON.stringify({ sub: "u1", exp })).replace(/=+$/, "")}.sig`;
}
const last = () => written[written.length - 1] ?? "";

describe("the Decane session cookie", () => {
  // An iframe navigation carries no Authorization header, so this cookie is the
  // only way /api/chess/play can know who is asking.
  it("writes the token for a document navigation to carry", () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    syncDecaneSessionCookie(token);
    expect(last()).toContain(`decane-token=${token}`);
  });

  it("scopes it to /api and same-site only", () => {
    syncDecaneSessionCookie(jwt(Math.floor(Date.now() / 1000) + 3600));
    expect(last()).toContain("Path=/api");
    expect(last()).toContain("SameSite=Lax");
  });

  it("expires with the token rather than outliving it", () => {
    syncDecaneSessionCookie(jwt(Math.floor(Date.now() / 1000) + 600));
    const maxAge = Number(/Max-Age=(\d+)/.exec(last())?.[1]);
    expect(maxAge).toBeGreaterThan(590);
    expect(maxAge).toBeLessThanOrEqual(600);
  });

  it("refuses to hold an already-expired token", () => {
    syncDecaneSessionCookie(jwt(Math.floor(Date.now() / 1000) - 1));
    expect(last()).toContain("Max-Age=0");
    expect(last()).not.toContain("h.eyJ");
  });

  it("clears on sign-out", () => {
    clearDecaneSessionCookie();
    expect(last()).toContain("decane-token=;");
    expect(last()).toContain("Max-Age=0");
  });

  it("still writes a token it cannot parse, with a bounded lifetime", () => {
    syncDecaneSessionCookie("opaque-token");
    expect(last()).toContain("decane-token=opaque-token");
    expect(last()).toContain("Max-Age=3600");
  });
});

describe("the flicker that broke chess mid-session", () => {
  // The cookie kept vanishing and reappearing: a transient null from the kit
  // (rotating, or still hydrating) was being treated as a sign-out and wiping
  // a good cookie, so any iframe navigation landing in the gap arrived
  // anonymous. The caller must not clear on a null it cannot explain.
  it("a write is not undone by the next write", () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    syncDecaneSessionCookie(token);
    syncDecaneSessionCookie(token);
    expect(last()).toContain(`decane-token=${token}`);
    expect(last()).not.toContain("Max-Age=0");
  });

  it("still clears when explicitly told to", () => {
    syncDecaneSessionCookie(jwt(Math.floor(Date.now() / 1000) + 3600));
    clearDecaneSessionCookie();
    expect(last()).toContain("Max-Age=0");
  });
});
