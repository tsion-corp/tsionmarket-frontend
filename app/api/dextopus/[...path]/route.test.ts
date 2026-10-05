import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyRequest = vi.fn();
const dextopusRequest = vi.fn();

vi.mock("@/lib/server/auth", () => ({ verifyRequest: () => verifyRequest() }));
vi.mock("@/lib/server/dextopus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/dextopus")>()),
  dextopusRequest: (...args: unknown[]) => dextopusRequest(...args),
}));

import { GET, POST } from "./route";

function get(path: string[]) {
  const req = new NextRequest(
    `http://localhost:3000/api/dextopus/${path.join("/")}?originChainId=8453`
  );
  return GET(req, { params: Promise.resolve({ path }) });
}

function post(path: string[]) {
  const req = new NextRequest(`http://localhost:3000/api/dextopus/${path.join("/")}`, {
    method: "POST",
    body: JSON.stringify({ amount: "1" }),
  });
  return POST(req, { params: Promise.resolve({ path }) });
}

// The spot markets list is built from the buy catalog, and pages open without
// a session now. The catalog is the same for everyone; anything that quotes or
// moves money still needs a session.
describe("Dextopus proxy without a session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequest.mockResolvedValue(null);
    dextopusRequest.mockResolvedValue(Response.json({ data: [] }));
  });

  it("serves the buy catalog", async () => {
    const res = await get(["trade", "deposit", "destinations"]);
    expect(res.status).toBe(200);
    expect(dextopusRequest).toHaveBeenCalledTimes(1);
  });

  it("serves the chain and token lists", async () => {
    expect((await get(["deposit", "chains"])).status).toBe(200);
    expect((await get(["deposit", "tokens"])).status).toBe(200);
  });

  it("refuses a quote", async () => {
    const res = await post(["trade", "deposit", "quote"]);
    expect(res.status).toBe(401);
    expect(dextopusRequest).not.toHaveBeenCalled();
  });

  it("refuses a status read", async () => {
    const res = await get(["deposit", "status"]);
    expect(res.status).toBe(401);
    expect(dextopusRequest).not.toHaveBeenCalled();
  });
});

describe("Dextopus proxy with a session", () => {
  it("still serves quotes", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    dextopusRequest.mockResolvedValue(Response.json({ ok: true }));
    const res = await post(["trade", "deposit", "quote"]);
    expect(res.status).toBe(200);
  });
});
