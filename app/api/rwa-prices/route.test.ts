import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyRequest = vi.fn();
const fetchRwaMarket = vi.fn();
const isCatalogAsset = vi.fn();

vi.mock("@/lib/server/auth", () => ({ verifyRequest: () => verifyRequest() }));
vi.mock("@/lib/server/rwa-prices", () => ({
  fetchRwaMarket: (...args: unknown[]) => fetchRwaMarket(...args),
}));
vi.mock("@/lib/server/rwa-registry", () => ({
  isCatalogAsset: (...args: unknown[]) => isCatalogAsset(...args),
}));

const CATALOG = { id: "ethereum:0xusdy", chain: "ethereum", address: "0xusdy" };
const STRANGER = { id: "base:0xother", chain: "base", address: "0xother" };

function request(items: unknown[]) {
  return new NextRequest("http://localhost:3000/api/rwa-prices", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

describe("POST /api/rwa-prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRwaMarket.mockResolvedValue({ [CATALOG.id]: { priceUsd: 1 } });
    isCatalogAsset.mockImplementation(
      async (_chain: string, address: string) => address === "0xusdy"
    );
  });

  it("answers a signed-out visitor for catalogue assets only", async () => {
    verifyRequest.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(request([CATALOG, STRANGER]));
    expect(res.status).toBe(200);
    expect(fetchRwaMarket).toHaveBeenCalledWith([CATALOG]);
  });

  it("prices whatever a signed-in user asks for", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await import("./route");
    await POST(request([CATALOG, STRANGER]));
    expect(fetchRwaMarket).toHaveBeenCalledWith([CATALOG, STRANGER]);
    expect(isCatalogAsset).not.toHaveBeenCalled();
  });
});
