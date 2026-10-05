import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyRequest = vi.fn();
const fetchTokenHistory = vi.fn();
const isCatalogAsset = vi.fn();

vi.mock("@/lib/server/auth", () => ({ verifyRequest: () => verifyRequest() }));
vi.mock("@/lib/server/token-history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/token-history")>();
  return { ...actual, fetchTokenHistory: (...args: unknown[]) => fetchTokenHistory(...args) };
});
vi.mock("@/lib/server/rwa-registry", () => ({
  isCatalogAsset: (...args: unknown[]) => isCatalogAsset(...args),
}));

const USDY = "0x96f6ef951840721adbf46ac996b59e0235cb985c";
const OTHER = "0x1111111111111111111111111111111111111111";

function request(address: string) {
  return new NextRequest(`http://localhost:3000/api/rwa-chart?chain=ethereum&address=${address}`);
}

describe("GET /api/rwa-chart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchTokenHistory.mockResolvedValue([{ time: 1, value: 1 }]);
    isCatalogAsset.mockImplementation(async (_chain: string, address: string) => address === USDY);
  });

  it("draws a catalogue asset's chart for a signed-out visitor", async () => {
    verifyRequest.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(request(USDY));
    expect(res.status).toBe(200);
    expect(fetchTokenHistory).toHaveBeenCalledWith("ethereum", USDY);
  });

  it("refuses an unknown token without a session", async () => {
    verifyRequest.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(request(OTHER));
    expect(res.status).toBe(404);
    expect(fetchTokenHistory).not.toHaveBeenCalled();
  });

  it("serves any valid token to a signed-in user", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { GET } = await import("./route");
    const res = await GET(request(OTHER));
    expect(res.status).toBe(200);
    expect(isCatalogAsset).not.toHaveBeenCalled();
  });
});
