import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/service", () => ({
  createServiceClient: () => ({ publicPost: post, get: vi.fn() }),
}));

import { submitGameMetadata } from "./vault-api";

const TX = `0x${"a".repeat(64)}`;
const SIGNER = "0x85178FEb764f92A919Ff49717d9b493AA4F55784";

beforeEach(() => post.mockReset().mockResolvedValue({}));

describe("submitGameMetadata", () => {
  // The vault requires signer and compares it to the address it recovers from
  // the signature. Without it every submission is refused as a mismatch, which
  // is silent: the game opens, the name never appears, and nothing surfaces.
  it("sends the signing address, which the vault requires", async () => {
    await submitGameMetadata({
      txHash: TX,
      title: "Friday",
      signature: "0xsig",
      timestamp: 1_700_000_000_000,
      signer: SIGNER,
    });

    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/games/metadata");
    expect(body).toMatchObject({
      txHash: TX,
      title: "Friday",
      signature: "0xsig",
      timestamp: 1_700_000_000_000,
      signer: SIGNER,
    });
  });

  it("sends every field the service lists as required", async () => {
    await submitGameMetadata({
      txHash: TX,
      title: "Friday",
      signature: "0xsig",
      timestamp: 1,
      signer: SIGNER,
    });
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    for (const field of ["txHash", "title", "signer", "timestamp", "signature"]) {
      expect(body[field], `missing required field: ${field}`).toBeDefined();
    }
  });

  it("omits an absent description rather than sending an empty one", async () => {
    await submitGameMetadata({
      txHash: TX,
      title: "Friday",
      signature: "0xsig",
      timestamp: 1,
      signer: SIGNER,
    });
    expect(post.mock.calls[0][1]).not.toHaveProperty("description");
  });
});
