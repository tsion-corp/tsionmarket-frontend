import { describe, expect, it } from "vitest";
import type { SecureClient } from "./secure-client";
import { COMBO_QUOTE_PROVIDER_PATH, createPolymarketAccountHeaders } from "./account-auth";

const client = {
  account: {
    signer: "0x1111111111111111111111111111111111111111",
  },
  credentials: {
    key: "account-key",
    passphrase: "account-passphrase",
    secret: "c2VjcmV0",
  },
} as unknown as SecureClient;

describe("Polymarket account authentication", () => {
  it("matches the provider HMAC wire algorithm", async () => {
    const headers = await createPolymarketAccountHeaders(
      client,
      "POST",
      COMBO_QUOTE_PROVIDER_PATH,
      '{"a":1}',
      1_700_000_000
    );

    expect(headers).toEqual({
      "x-polymarket-account-address": "0x1111111111111111111111111111111111111111",
      "x-polymarket-account-api-key": "account-key",
      "x-polymarket-account-passphrase": "account-passphrase",
      "x-polymarket-account-timestamp": "1700000000",
      "x-polymarket-account-signature": "n2ViIEzTLRbDeRqPUL9rk0Xn1kzHgm-WWbqeZ0TSI-s=",
    });
  });
});
