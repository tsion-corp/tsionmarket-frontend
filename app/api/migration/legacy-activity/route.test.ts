import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyRequest = vi.fn();
const fetchActivity = vi.fn();
const forwardMigration = vi.fn();

vi.mock("@/lib/server/auth", () => ({ verifyRequest: () => verifyRequest() }));
vi.mock("@/lib/server/activity", () => ({
  fetchActivity: (...args: unknown[]) => fetchActivity(...args),
}));
vi.mock("@/lib/server/migration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/migration")>();
  return {
    ...actual,
    migrationServiceEnabled: () => true,
    forwardMigration: (...args: unknown[]) => forwardMigration(...args),
  };
});

const OLD = "0x7bd20000000000000000000000000000000043ba";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function request(method: "GET" | "POST") {
  return new NextRequest("http://localhost:3000/api/migration/legacy-activity", {
    method,
    headers: { authorization: "Bearer decane" },
  });
}

/*
  The old wallet's history is read once and kept under the new account. The
  addresses come from the service's record of the link, never from the
  client, and an incomplete sweep is never stored as if it were the whole.
*/
describe("POST /api/migration/legacy-activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequest.mockResolvedValue({ sub: "user" });
  });

  it("sweeps the linked old wallet and stores it, tagged as the old account", async () => {
    forwardMigration.mockImplementation(async (path: string) =>
      path === "/status"
        ? json(200, { success: true, data: { linked: true, legacy: { evm: OLD, solana: null } } })
        : json(200, { success: true, data: { saved: 1 } })
    );
    fetchActivity.mockResolvedValue({
      items: [{ id: "a", hash: "0x1", network: "base-mainnet", timestamp: 1 }],
      unavailable: [],
    });

    const { POST } = await import("./route");
    const res = await POST(request("POST"));

    expect(res.status).toBe(200);
    expect(fetchActivity).toHaveBeenCalledWith(OLD, undefined, 200);
    const save = forwardMigration.mock.calls.find(([path]) => path === "/legacy-activity");
    expect(save?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse((save?.[1] as { body: string }).body)).toEqual({
      items: [{ id: "a", hash: "0x1", network: "base-mainnet", timestamp: 1, legacy: true }],
    });
  });

  it("refuses before the link exists", async () => {
    forwardMigration.mockResolvedValue(
      json(200, { success: true, data: { linked: false, legacy: null } })
    );
    const { POST } = await import("./route");
    const res = await POST(request("POST"));
    expect(res.status).toBe(409);
    expect(fetchActivity).not.toHaveBeenCalled();
  });

  it("never stores a sweep with a hole in it", async () => {
    forwardMigration.mockResolvedValue(
      json(200, { success: true, data: { linked: true, legacy: { evm: OLD, solana: null } } })
    );
    fetchActivity.mockResolvedValue({ items: [], unavailable: ["base-mainnet"] });
    const { POST } = await import("./route");
    const res = await POST(request("POST"));
    expect(res.status).toBe(503);
    expect(forwardMigration).not.toHaveBeenCalledWith("/legacy-activity", expect.anything());
  });

  it("has nothing to keep for an old account without a wallet", async () => {
    forwardMigration.mockResolvedValue(
      json(200, { success: true, data: { linked: true, legacy: { evm: null, solana: null } } })
    );
    const { POST } = await import("./route");
    const res = await POST(request("POST"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { saved: 0 } });
    expect(fetchActivity).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    verifyRequest.mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(request("POST"))).status).toBe(401);
  });
});
