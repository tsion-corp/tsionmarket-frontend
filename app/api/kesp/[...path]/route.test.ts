import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { verifyRequest, fetchMock } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  fetchMock: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

import { GET, POST } from "./route";

const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const ADDRESS = "wsk1q9dunpfcdfj89hq2w9ra3q4qqgrpwmxmvu00z67f";
const ok = () =>
  new Response(JSON.stringify({ success: true, data: { quote: { amountKesp: "3" } } }), {
    status: 200,
  });

beforeEach(() => {
  verifyRequest.mockResolvedValue({ userId: "u" });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const get = (path: string) =>
  GET(new NextRequest(`http://app.test/api/kesp/${path}`), ctx(path.split("?")[0]!));
const post = (body: unknown) =>
  POST(
    new NextRequest("http://app.test/api/kesp/orders", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    ctx("orders")
  );

describe("/api/kesp", () => {
  it("needs a signed-in user", async () => {
    verifyRequest.mockResolvedValue(null);
    expect((await get("quote?amountNgn=5000")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays a quote, and refuses a bad amount before asking the service", async () => {
    expect((await get("quote?amountNgn=5000")).status).toBe(200);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/kesp/quote?amountNgn=5000");
    expect((await get("quote?amountNgn=abc")).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates an order only for a valid amount and an Intertrain address", async () => {
    expect((await post({ amountNgn: "5000", address: ADDRESS })).status).toBe(200);
    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(sent).toEqual({ amountNgn: "5000", address: ADDRESS });
    expect((await post({ amountNgn: "5000", address: "0xabc" })).status).toBe(400);
    expect((await post({ amountNgn: "-1", address: ADDRESS })).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reaches nothing else of the service", async () => {
    expect((await get("admin/users")).status).toBe(404);
    expect((await get("orders/../secret")).status).toBe(404);
  });
});
