import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

import { DELETE, GET, POST } from "./route";

const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const req = (path: string, method = "GET", body?: string) =>
  new NextRequest(`http://app.test/api/notification/${path}`, {
    method,
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });

function upstream(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  ) as unknown as Promise<Response>;
}

beforeEach(() => {
  verifyRequest.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("the notification proxy", () => {
  it("forwards the inbox with its query intact", async () => {
    verifyRequest.mockResolvedValue({ sub: "u" });
    vi.mocked(fetch).mockReturnValue(upstream({ success: true, data: { items: [] } }));

    const res = await GET(req("notifications?limit=50&cursor=abc"), ctx("notifications"));

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("notifications?limit=50&cursor=abc");
  });

  it("forwards the routes the bell needs, and no others", async () => {
    verifyRequest.mockResolvedValue({ sub: "u" });
    const allowed: Array<[string, "GET" | "POST" | "DELETE"]> = [
      ["notifications", "GET"],
      ["notifications/unread-count", "GET"],
      ["notifications/read-all", "POST"],
      ["notifications/abc123/read", "POST"],
      ["push/subscriptions", "POST"],
      ["push/subscriptions", "DELETE"],
    ];
    for (const [path, method] of allowed) {
      vi.mocked(fetch).mockReturnValue(upstream({ success: true }));
      const handler = method === "GET" ? GET : method === "POST" ? POST : DELETE;
      const res = await handler(req(path, method, method === "GET" ? undefined : "{}"), ctx(path));
      expect(res.status, `${method} ${path} should be forwarded`).toBe(200);
    }
  });

  // The service's own docs, health and anything shaped like a traversal stay
  // out: a proxy is only ever as narrow as its list.
  it("refuses anything outside the list", async () => {
    verifyRequest.mockResolvedValue({ sub: "u" });
    for (const path of ["health", "openapi.json", "notifications/../admin", "admin", ""]) {
      vi.mocked(fetch).mockClear();
      const res = await GET(req(path), ctx(path));
      expect(res.status, `GET ${path} must be refused`).toBe(404);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    }
  });

  // Every route here reads or writes one person's own mail.
  it("needs a session for every route", async () => {
    verifyRequest.mockResolvedValue(null);
    const res = await GET(req("notifications"), ctx("notifications"));
    expect(res.status).toBe(401);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("passes the bearer token through, which is what identifies the reader", async () => {
    verifyRequest.mockResolvedValue({ sub: "u" });
    vi.mocked(fetch).mockReturnValue(upstream({ success: true }));
    await GET(req("notifications"), ctx("notifications"));
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });

  it("never caches: this is one person's mail", async () => {
    verifyRequest.mockResolvedValue({ sub: "u" });
    vi.mocked(fetch).mockReturnValue(upstream({ success: true }));
    await GET(req("notifications"), ctx("notifications"));
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
  });
});
