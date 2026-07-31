import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSponsorCache, forgetSponsor, resolveSponsorId } from "@/lib/earn/sponsor-identity";

// The earn service acts on whatever sponsor id it is handed, so this resolution
// is the only thing stopping one user from editing another company's listings.
// These cover the cases where getting it wrong would be a security hole.

beforeEach(() => {
  clearSponsorCache();
});

describe("resolveSponsorId", () => {
  it("returns the sponsor the lookup reports for that user", async () => {
    const fetchSponsor = vi.fn().mockResolvedValue("sponsor_456");
    await expect(resolveSponsorId("user_123", fetchSponsor)).resolves.toBe("sponsor_456");
    expect(fetchSponsor).toHaveBeenCalledWith("user_123");
  });

  it("returns null when the user owns no sponsor", async () => {
    const fetchSponsor = vi.fn().mockResolvedValue(null);
    await expect(resolveSponsorId("user_123", fetchSponsor)).resolves.toBeNull();
  });

  it("never answers with anything the caller supplied", async () => {
    // The only input is a user id. Whatever a browser sent as a sponsor id
    // cannot reach this function, and the answer comes from the lookup alone.
    const fetchSponsor = vi.fn().mockResolvedValue("sponsor_owned");
    await expect(resolveSponsorId("sponsor_forged", fetchSponsor)).resolves.toBe("sponsor_owned");
  });

  it("keeps two users' sponsors apart", async () => {
    const fetchSponsor = vi.fn(async (userId: string) =>
      userId === "user_a" ? "sponsor_a" : "sponsor_b"
    );

    await expect(resolveSponsorId("user_a", fetchSponsor)).resolves.toBe("sponsor_a");
    await expect(resolveSponsorId("user_b", fetchSponsor)).resolves.toBe("sponsor_b");
  });

  it("caches within the TTL rather than asking on every request", async () => {
    const fetchSponsor = vi.fn().mockResolvedValue("sponsor_456");

    await resolveSponsorId("user_123", fetchSponsor);
    await resolveSponsorId("user_123", fetchSponsor);
    await resolveSponsorId("user_123", fetchSponsor);

    expect(fetchSponsor).toHaveBeenCalledTimes(1);
  });

  it("asks again once the cached answer has expired", async () => {
    const fetchSponsor = vi.fn().mockResolvedValue("sponsor_456");

    await resolveSponsorId("user_123", fetchSponsor);
    // A `now` past the entry's expiry stands in for the clock moving on.
    await resolveSponsorId("user_123", fetchSponsor, Date.now() + 120_000);

    expect(fetchSponsor).toHaveBeenCalledTimes(2);
  });

  it("caches a null answer too, so a user with no sponsor is not a lookup per request", async () => {
    const fetchSponsor = vi.fn().mockResolvedValue(null);

    await resolveSponsorId("user_123", fetchSponsor);
    await resolveSponsorId("user_123", fetchSponsor);

    expect(fetchSponsor).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent lookups for the same user into one call", async () => {
    // A dashboard mount fires several sponsor-scoped requests at once.
    const fetchSponsor = vi.fn().mockResolvedValue("sponsor_456");

    const results = await Promise.all([
      resolveSponsorId("user_123", fetchSponsor),
      resolveSponsorId("user_123", fetchSponsor),
      resolveSponsorId("user_123", fetchSponsor),
    ]);

    expect(fetchSponsor).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["sponsor_456", "sponsor_456", "sponsor_456"]);
  });

  it("does not hold a failed lookup as a cached answer forever", async () => {
    const fetchSponsor = vi.fn().mockRejectedValue(new Error("upstream down"));
    await expect(resolveSponsorId("user_123", fetchSponsor)).rejects.toThrow("upstream down");

    fetchSponsor.mockResolvedValue("sponsor_456");
    await expect(resolveSponsorId("user_123", fetchSponsor)).resolves.toBe("sponsor_456");
  });

  it("forgets a user on request, so a new sponsor works without waiting out the TTL", async () => {
    const fetchSponsor = vi.fn().mockResolvedValue(null);
    await resolveSponsorId("user_123", fetchSponsor);

    forgetSponsor("user_123");
    fetchSponsor.mockResolvedValue("sponsor_456");

    await expect(resolveSponsorId("user_123", fetchSponsor)).resolves.toBe("sponsor_456");
    expect(fetchSponsor).toHaveBeenCalledTimes(2);
  });
});
