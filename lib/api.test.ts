import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  resolveAuthTokens: vi.fn(),
}));

vi.mock("@/lib/privy-token", () => auth);

import { apiFetch } from "@/lib/api";

describe("apiFetch authentication", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    auth.resolveAuthTokens.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send an authenticated request without an identity token", async () => {
    auth.resolveAuthTokens.mockResolvedValue({ accessToken: "access-token", idToken: null });

    await expect(apiFetch("/api/private", {}, { requireAuth: true })).rejects.toThrow(
      "Auth not ready, retrying"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards both Privy tokens when authentication is ready", async () => {
    auth.resolveAuthTokens.mockResolvedValue({
      accessToken: "access-token",
      idToken: "identity-token",
    });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/private", {}, { requireAuth: true });

    const request = fetchMock.mock.calls[0];
    const headers = request[1]?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer access-token");
    expect(headers.get("privy-id-token")).toBe("identity-token");
  });
});
