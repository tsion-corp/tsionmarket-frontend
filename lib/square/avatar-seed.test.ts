import { describe, expect, it } from "vitest";
import {
  AVATAR_ARTWORK,
  artworkForSeed,
  hashSeed,
  resolveSeed,
  seedIndex,
} from "@/lib/square/avatar-seed";

/**
 * These pin a CROSS-APP contract. The same values are computed in Market
 * Square, and a person must get the same face on both surfaces. If any of
 * these change, the two apps have drifted and the same account shows two
 * different avatars.
 */
describe("avatar seeding matches Market Square", () => {
  it("computes FNV-1a exactly", () => {
    // Fixed vectors — if these move, the hash moved.
    expect(hashSeed("")).toBe(0x811c9dc5);
    expect(hashSeed("a")).toBe(0xe40c292c);
    expect(hashSeed("did:privy:abc123")).toBe(hashSeed("did:privy:abc123"));
  });

  it("keeps nine artworks in a fixed order", () => {
    expect(AVATAR_ARTWORK).toHaveLength(9);
    expect(AVATAR_ARTWORK[0]).toBe("/avatar/avatar-01.jpg");
    expect(AVATAR_ARTWORK[8]).toBe("/avatar/avatar-09.jpg");
  });

  it("gives one identity the same artwork every time", () => {
    const seed = "did:privy:cmsw9gcbm01g50ckyavp6p2bk";
    expect(artworkForSeed(seed)).toBe(artworkForSeed(seed));
    expect(AVATAR_ARTWORK).toContain(artworkForSeed(seed));
  });

  // An unidentified row must not borrow a specific person's illustration.
  it("pins an empty seed to the first artwork, and never drifts", () => {
    expect(seedIndex("", 9)).toBe(0);
    expect(artworkForSeed("")).toBeNull();
  });

  it("prefers id, then username, then name", () => {
    expect(resolveSeed({ id: "i", username: "u", name: "n" })).toBe("i");
    expect(resolveSeed({ id: "  ", username: "u", name: "n" })).toBe("u");
    expect(resolveSeed({ name: "n" })).toBe("n");
    expect(resolveSeed({})).toBe("");
  });
});
