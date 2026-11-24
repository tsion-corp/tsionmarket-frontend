import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPaycrestOfframpOrder,
  createPaycrestOnrampOrder,
  getPaycrestOrder,
  getPaycrestQuote,
  PaycrestError,
  verifyPaycrestAccount,
} from "./paycrest";

const WALLET = "0x1111111111111111111111111111111111111111";

function respond(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  );
}

function lastCall() {
  const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
  return {
    url: String(url),
    init: init as RequestInit,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

const offrampOrder = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  status: "initiated",
  orderType: "regular",
  amount: "100",
  rate: "1441.2",
  providerAccount: {
    network: "base",
    receiveAddress: "0x2222222222222222222222222222222222222222",
    validUntil: "2026-11-24T10:05:00Z",
    amountToTransfer: "100.6",
    currency: "USDC",
  },
};

const onrampOrder = {
  id: "660e8400-e29b-41d4-a716-446655440000",
  status: "initiated",
  amount: "34.2",
  providerAccount: {
    institution: "Guaranty Trust Bank",
    accountIdentifier: "0123456789",
    accountName: "Provider A / Ada Obi",
    amountToTransfer: "50000",
    currency: "NGN",
    validUntil: "2026-11-24T10:05:00Z",
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("PAYCREST_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public reads", () => {
  it("reads both sides of a quote from the v2 rates path, without the key", async () => {
    vi.mocked(fetch).mockReturnValue(
      respond({
        status: "success",
        data: {
          buy: { rate: "1459.71", providerIds: ["etoMCRIY"], orderType: "regular" },
          sell: { rate: "1441.2", providerIds: ["YyPrHKaI", "etoMCRIY"], orderType: "regular" },
        },
      })
    );
    const quote = await getPaycrestQuote("USDC", "10", "NGN");
    expect(lastCall().url).toBe("https://api.paycrest.io/v2/rates/base/USDC/10/NGN");
    expect((lastCall().init.headers as Record<string, string>)["API-Key"]).toBeUndefined();
    expect(quote.sell).toEqual({ rate: "1441.2", providerIds: ["YyPrHKaI", "etoMCRIY"] });
    expect(quote.buy?.rate).toBe("1459.71");
  });

  it("rejects a quote whose rate is not a decimal string", async () => {
    vi.mocked(fetch).mockReturnValue(
      respond({ status: "success", data: { sell: { rate: 1441 } } })
    );
    await expect(getPaycrestQuote("USDC", "10", "NGN")).rejects.toMatchObject({
      status: 502,
      code: "BAD_RESPONSE",
    });
  });
});

describe("verify-account", () => {
  it("returns the resolved name, and null when Paycrest only says OK", async () => {
    vi.mocked(fetch).mockReturnValueOnce(respond({ status: "success", data: "ADA OBI" }));
    await expect(verifyPaycrestAccount("GTBINGLA", "0123456789")).resolves.toEqual({
      accountName: "ADA OBI",
    });
    expect((lastCall().init.headers as Record<string, string>)["API-Key"]).toBe("test-key");

    vi.mocked(fetch).mockReturnValueOnce(respond({ status: "success", data: "OK" }));
    await expect(verifyPaycrestAccount("SAFAKEPC", "0712345678")).resolves.toEqual({
      accountName: null,
    });
  });

  it("refuses to call without a key instead of sending an unauthenticated request", async () => {
    vi.stubEnv("PAYCREST_API_KEY", "");
    await expect(verifyPaycrestAccount("GTBINGLA", "0123456789")).rejects.toMatchObject({
      status: 503,
      code: "NOT_CONFIGURED",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("offramp orders", () => {
  const request = {
    amount: "100",
    token: "USDC" as const,
    currency: "NGN",
    rate: "1441.2",
    providerIds: ["YyPrHKaI"],
    recipient: {
      institution: "GTBINGLA",
      accountIdentifier: "0123456789",
      accountName: "Ada Obi",
      memo: "Ark withdrawal",
    },
    reference: "offramp-abc12345",
  };

  it("posts the v2 offramp shape with the server's refund address", async () => {
    vi.mocked(fetch).mockReturnValue(respond({ status: "success", data: offrampOrder }, 201));
    const order = await createPaycrestOfframpOrder(request, WALLET);
    const { url, body, init } = lastCall();
    expect(url).toBe("https://api.paycrest.io/v2/sender/orders");
    expect(init.method).toBe("POST");
    expect(body).toEqual({
      amount: "100",
      rate: "1441.2",
      reference: "offramp-abc12345",
      source: { type: "crypto", currency: "USDC", network: "base", refundAddress: WALLET },
      destination: {
        type: "fiat",
        currency: "NGN",
        providerIds: ["YyPrHKaI"],
        recipient: request.recipient,
      },
    });
    expect(order.deposit).toEqual({
      kind: "crypto",
      network: "base",
      receiveAddress: offrampOrder.providerAccount.receiveAddress,
      validUntil: offrampOrder.providerAccount.validUntil,
      amountToTransfer: "100.6",
      currency: "USDC",
      memo: null,
    });
  });

  it("fails loudly when the order comes back without a receive address", async () => {
    vi.mocked(fetch).mockReturnValue(
      respond({ status: "success", data: { ...offrampOrder, providerAccount: undefined } }, 201)
    );
    await expect(createPaycrestOfframpOrder(request, WALLET)).rejects.toBeInstanceOf(PaycrestError);
  });

  it("passes Paycrest's own validation message through with its status", async () => {
    vi.mocked(fetch).mockReturnValue(
      respond(
        {
          status: "error",
          message: "Failed to validate payload",
          data: { field: "Recipient", message: "Invalid account" },
        },
        400
      )
    );
    await expect(createPaycrestOfframpOrder(request, WALLET)).rejects.toMatchObject({
      status: 400,
      message: "Invalid account",
    });
  });

  it("reports Paycrest's own outage as a 502", async () => {
    vi.mocked(fetch).mockReturnValue(respond({ status: "error", message: "boom" }, 500));
    await expect(createPaycrestOfframpOrder(request, WALLET)).rejects.toMatchObject({
      status: 502,
    });
  });
});

describe("onramp orders", () => {
  const request = {
    amount: "50000",
    token: "USDC" as const,
    currency: "NGN",
    refundAccount: {
      institution: "GTBINGLA",
      accountIdentifier: "0123456789",
      accountName: "Ada Obi",
    },
    kyc: {
      fullName: "Ada Obi",
      birthDate: "1990-04-12",
      idType: "BVN" as const,
      idNumber: "22212345678",
    },
    reference: "onramp-abc12345",
  };

  it("posts fiat-denominated v2 onramp with person KYC and the server's wallet", async () => {
    vi.mocked(fetch).mockReturnValue(respond({ status: "success", data: onrampOrder }, 201));
    const order = await createPaycrestOnrampOrder(request, WALLET);
    expect(lastCall().body).toEqual({
      amount: "50000",
      amountIn: "fiat",
      reference: "onramp-abc12345",
      source: {
        type: "fiat",
        currency: "NGN",
        refundAccount: request.refundAccount,
        kyc: {
          entityType: "person",
          personDetails: {
            fullName: "Ada Obi",
            birthDate: "1990-04-12",
            idDocument: { type: "BVN", number: "22212345678", issuerCountry: "NG" },
          },
        },
      },
      destination: {
        type: "crypto",
        currency: "USDC",
        recipient: { address: WALLET, network: "base" },
      },
    });
    expect(order.deposit).toMatchObject({
      kind: "fiat",
      accountIdentifier: "0123456789",
      amountToTransfer: "50000",
    });
  });

  it("refuses a corridor it cannot take KYC for, before calling Paycrest", async () => {
    await expect(
      createPaycrestOnrampOrder({ ...request, currency: "KES" }, WALLET)
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("order reads", () => {
  it("names the offramp's refund address as its owner", async () => {
    vi.mocked(fetch).mockReturnValue(
      respond({
        status: "success",
        data: {
          ...offrampOrder,
          status: "validated",
          direction: "offramp",
          paymentReference: "TIMCW5AK69",
          source: { type: "crypto", currency: "USDC", network: "base", refundAddress: WALLET },
          destination: { type: "fiat", currency: "NGN", recipient: { institution: "GTBINGLA" } },
        },
      })
    );
    const { order, owner } = await getPaycrestOrder(offrampOrder.id);
    expect(lastCall().url).toBe(`https://api.paycrest.io/v2/sender/orders/${offrampOrder.id}`);
    expect(owner).toBe(WALLET);
    expect(order).toMatchObject({ status: "validated", paymentReference: "TIMCW5AK69" });
  });

  it("names the onramp's recipient as its owner", async () => {
    vi.mocked(fetch).mockReturnValue(
      respond({
        status: "success",
        data: {
          ...onrampOrder,
          direction: "onramp",
          source: { type: "fiat", currency: "NGN" },
          destination: {
            type: "crypto",
            currency: "USDC",
            recipient: { address: WALLET, network: "base" },
          },
        },
      })
    );
    const { owner } = await getPaycrestOrder(onrampOrder.id);
    expect(owner).toBe(WALLET);
  });

  it("rejects an order with an unknown status rather than guessing", async () => {
    vi.mocked(fetch).mockReturnValue(
      respond({ status: "success", data: { ...offrampOrder, status: "mystery" } })
    );
    await expect(getPaycrestOrder(offrampOrder.id)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});
