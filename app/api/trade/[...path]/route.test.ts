import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The relay is the only thing between the browser and the trade service. The
// contract says every failure envelope carries a requestId that support asks
// for, so the relay's OWN failures (unreachable upstream, a response it could
// not understand) mint one, and an upstream requestId is echoed as a header
// the one transport can read without consuming the body.

vi.mock("server-only", () => ({}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";
import {
  LIVE_RISK,
  LIVE_TOKEN_DETAIL,
  SWAP_DETAIL,
  SWAP_STATUS,
} from "@/lib/api/schemas/trade.fixtures";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const get = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://app.test/api/trade/${path}`, { headers });

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchMock.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("relay-minted request ids", () => {
  it("mints a requestId when the upstream cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.requestId).toMatch(UUID);
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("mints a requestId when the upstream answer does not match the contract", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { items: "not a list" } }), {
        status: 200,
      })
    );
    const res = await GET(get("tokens?page=1&limit=1"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_RESPONSE");
    expect(body.error.requestId).toMatch(UUID);
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("mints a different id per failure, so two screenshots never share one", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const a = await (await GET(get("swaps/a/status"))).json();
    const b = await (await GET(get("swaps/b/status"))).json();
    expect(a.error.requestId).not.toBe(b.error.requestId);
  });
});

describe("upstream request ids", () => {
  it("passes the service's own failure envelope through untouched and echoes its requestId as a header", async () => {
    const upstream = {
      success: false,
      error: {
        code: "NO_SWAP_ROUTE",
        message: "no route",
        details: null,
        requestId: "req-upstream-1",
      },
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(upstream), { status: 422 }));
    const res = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual(upstream);
    expect(res.headers.get("x-request-id")).toBe("req-upstream-1");
  });

  it("sets no header when the upstream failure carried no id", async () => {
    fetchMock.mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    const res = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBeNull();
  });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// The relay validates by path template, so a route with an id in it is judged
// against its own schema rather than passing through unchecked.
describe("validation by path template", () => {
  it("validates a swap's status against the status schema", async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: SWAP_STATUS }));
    const good = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(good.status).toBe(200);
    expect((await good.json()).data).toEqual(SWAP_STATUS);

    fetchMock.mockResolvedValue(json({ success: true, data: SWAP_DETAIL }));
    const drifted = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(drifted.status).toBe(502);
    expect((await drifted.json()).error.code).toBe("BAD_RESPONSE");
  });

  it("validates a token's risk read and rejects one that lost its level", async () => {
    const mint = "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp";
    fetchMock.mockResolvedValue(json({ success: true, data: LIVE_RISK }));
    expect((await GET(get(`tokens/${mint}/risk?chain=solana`))).status).toBe(200);

    const noLevel = Object.fromEntries(Object.entries(LIVE_RISK).filter(([k]) => k !== "level"));
    fetchMock.mockResolvedValue(json({ success: true, data: noLevel }));
    expect((await GET(get(`tokens/${mint}/risk?chain=solana&v=2`))).status).toBe(502);
  });
});

// The contract: a 502 PROVIDER_ERROR on a Solana detail read is temporary, so
// retry with backoff and never cache it as an invalid or missing mint. The
// relay's short public cache would otherwise hand the first retry the same
// 502 without asking the service again.
describe("the public token cache", () => {
  const detail = "tokens/x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp?chain=solana";

  it("does not cache a provider failure", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        { success: false, error: { code: "PROVIDER_ERROR", message: "rpc", requestId: "r1" } },
        502
      )
    );
    fetchMock.mockResolvedValueOnce(json({ success: true, data: LIVE_TOKEN_DETAIL }));
    expect((await GET(get(`${detail}&t=cache-502`))).status).toBe(502);
    const retry = await GET(get(`${detail}&t=cache-502`));
    expect(retry.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a not-found answer either", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        { success: false, error: { code: "TOKEN_NOT_FOUND", message: "gone", requestId: "r2" } },
        404
      )
    );
    fetchMock.mockResolvedValueOnce(json({ success: true, data: LIVE_TOKEN_DETAIL }));
    expect((await GET(get(`${detail}&t=cache-404`))).status).toBe(404);
    expect((await GET(get(`${detail}&t=cache-404`))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still serves a successful read from the cache", async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: LIVE_TOKEN_DETAIL }));
    await GET(get(`${detail}&t=cache-ok`));
    await GET(get(`${detail}&t=cache-ok`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
