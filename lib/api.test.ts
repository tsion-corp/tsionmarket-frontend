import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  resolveAuthTokens: vi.fn(),
}));

vi.mock("@/lib/auth-token", () => auth);

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

  it("does not send an authenticated request without an access token", async () => {
    auth.resolveAuthTokens.mockResolvedValue({ accessToken: null, idToken: null });

    await expect(apiFetch("/api/private", {}, { requireAuth: true })).rejects.toThrow(
      "Auth not ready, retrying"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the bearer alone for a Decane session, which has no identity token", async () => {
    auth.resolveAuthTokens.mockResolvedValue({ accessToken: "access-token", idToken: null });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/private", {}, { requireAuth: true });

    const request = fetchMock.mock.calls[0];
    const headers = request[1]?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer access-token");
    expect(headers.get("privy-id-token")).toBeNull();
  });

  it("asks the resolver for the named identity", async () => {
    auth.resolveAuthTokens.mockResolvedValue({ accessToken: "privy-access", idToken: "id" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/legacy", {}, { requireAuth: true, identity: "legacy" });

    expect(auth.resolveAuthTokens).toHaveBeenCalledWith("legacy");
  });

  it("fails a legacy call without a Privy session as a non-retryable session error", async () => {
    auth.resolveAuthTokens.mockResolvedValue({ accessToken: null, idToken: null });

    await expect(
      apiFetch("/api/legacy", {}, { requireAuth: true, identity: "legacy" })
    ).rejects.toMatchObject({ code: "LEGACY_SESSION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards both tokens when a Privy session supplies them", async () => {
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
