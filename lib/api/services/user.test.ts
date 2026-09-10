import { describe, expect, it, vi, beforeEach } from "vitest";

const authedGetMock = vi.fn();
vi.mock("@/lib/api/service", () => ({
  createServiceClient: () => ({
    authedGet: authedGetMock,
  }),
}));

describe("userService", () => {
  beforeEach(() => {
    authedGetMock.mockReset();
  });

  it("fetches the current authenticated user session", async () => {
    const { fetchCurrentUser } = await import("./user");
    const mockResponse = {
      userId: "did:privy:123",
      sessionId: "session-abc",
      user: {
        id: "did:privy:123",
        createdAt: "2026-09-01T00:00:00Z",
        linkedAccounts: ["wallet"],
        wallets: [
          {
            address: "0x123",
            chainType: "ethereum" as const,
            delegated: true,
            id: "server-wallet-1",
          },
        ],
      },
    };
    authedGetMock.mockResolvedValue(mockResponse);

    const result = await fetchCurrentUser();
    expect(authedGetMock).toHaveBeenCalledWith("/me");
    expect(result).toEqual(mockResponse);
  });
});
