import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Wiring tests against the handler: it holds the allow-list, decides what
// needs a session, stamps the session wallet onto orders and hides other
// users' orders. Only Paycrest's HTTP API (fetch) and the session are faked.

vi.mock("server-only", () => ({}));

const { verifyRequest, getRequestIdentity } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestIdentity: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest, getRequestIdentity }));

import { GET, POST } from "./route";

const WALLET = "0xAbC0000000000000000000000000000000000001";
const OTHER = "0xdef0000000000000000000000000000000000002";

const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const get = (path: string) => new NextRequest(`http://app.test/api/paycrest/${path}`);
const post = (path: string, body: unknown) =>
  new NextRequest(`http://app.test/api/paycrest/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

function upstream(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  );
}

function signedIn(address: string | null = WALLET) {
  verifyRequest.mockResolvedValue({ sub: "user" });
  getRequestIdentity.mockResolvedValue({
    userId: "user",
    evmAddress: address,
    solanaAddress: null,
  });
}

function sentBody() {
  const init = vi.mocked(fetch).mock.calls.at(-1)![1] as RequestInit;
  return JSON.parse(String(init.body));
}

const offramp = {
  amount: "25.5",
  token: "USDC",
  currency: "NGN",
  rate: "1441.2",
  providerIds: ["YyPrHKaI"],
  recipient: {
    institution: "GTBINGLA",
    accountIdentifier: "0123456789",
    accountName: "Ada Obi",
    memo: "Ark withdrawal",
  },
  reference: "offramp-0f1e2d3c",
};

const onramp = {
  amount: "50000",
  token: "USDC",
  currency: "NGN",
  refundAccount: {
    institution: "GTBINGLA",
    accountIdentifier: "0123456789",
    accountName: "Ada Obi",
  },
  kyc: { fullName: "Ada Obi", birthDate: "1990-04-12", idType: "BVN", idNumber: "22212345678" },
  reference: "onramp-0f1e2d3c",
};

const createdOfframp = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  status: "initiated",
  amount: "25.5",
  providerAccount: {
    network: "base",
    receiveAddress: "0x2222222222222222222222222222222222222222",
    validUntil: "2026-11-24T10:05:00Z",
    amountToTransfer: "25.62",
    currency: "USDC",
  },
};

beforeEach(() => {
  verifyRequest.mockReset();
  getRequestIdentity.mockReset();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("PAYCREST_API_KEY", "test-key");
});

describe("public reads", () => {
  it("serves a quote without a session", async () => {
    verifyRequest.mockResolvedValue(null);
    vi.mocked(fetch).mockReturnValue(
      upstream({ status: "success", data: { sell: { rate: "1441.2", providerIds: [] } } })
    );
    const res = await GET(get("rates/USDC/10/NGN"), ctx("rates/USDC/10/NGN"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { buy: null, sell: { rate: "1441.2", providerIds: [] } },
    });
  });

  it("serves the bank list for a currency without a session, cached", async () => {
    vi.mocked(fetch).mockReturnValue(
      upstream({ status: "success", data: [{ name: "GTBank", code: "GTBINGLA", type: "bank" }] })
    );
    const res = await GET(get("institutions/NGN"), ctx("institutions/NGN"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=600");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://api.paycrest.io/v2/institutions/NGN");
  });

  it("refuses tokens outside the allow-list and malformed amounts before calling out", async () => {
    for (const path of [
      "rates/CNGN/10/NGN",
      "rates/USDC/1e3/NGN",
      "rates/USDC/0/NGN",
      "institutions/ngn",
    ]) {
      const res = await GET(get(path), ctx(path));
      expect(res.status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not proxy anything off the allow-list", async () => {
    signedIn();
    for (const path of ["sender/orders", "orders", "webhooks", "tokens/extra"]) {
      expect((await GET(get(path), ctx(path))).status).toBe(404);
    }
    expect((await POST(post("sender/orders", {}), ctx("sender/orders"))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("orders and account checks", () => {
  it("need a session", async () => {
    verifyRequest.mockResolvedValue(null);
    for (const path of ["verify-account", "orders/offramp", "orders/onramp"]) {
      expect((await POST(post(path, {}), ctx(path))).status).toBe(401);
    }
    expect((await GET(get("orders/abc"), ctx("orders/abc"))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stamps the session wallet as the offramp's refund address", async () => {
    signedIn();
    vi.mocked(fetch).mockReturnValue(upstream({ status: "success", data: createdOfframp }, 201));
    const res = await POST(post("orders/offramp", offramp), ctx("orders/offramp"));
    expect(res.status).toBe(200);
    expect(sentBody().source.refundAddress).toBe(WALLET);
    const body = await res.json();
    expect(body.data.deposit.amountToTransfer).toBe("25.62");
  });

  it("refuses a browser-supplied wallet instead of quietly overriding it", async () => {
    signedIn();
    const res = await POST(
      post("orders/offramp", { ...offramp, refundAddress: OTHER }),
      ctx("orders/offramp")
    );
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses amounts finer than the token's six decimals", async () => {
    signedIn();
    const res = await POST(
      post("orders/offramp", { ...offramp, amount: "1.0000001" }),
      ctx("orders/offramp")
    );
    expect(res.status).toBe(400);
  });

  it("sends the onramp's tokens to the session wallet only", async () => {
    signedIn();
    vi.mocked(fetch).mockReturnValue(
      upstream(
        {
          status: "success",
          data: {
            id: "660e8400-e29b-41d4-a716-446655440000",
            status: "initiated",
            amount: "34.2",
            providerAccount: {
              institution: "Guaranty Trust Bank",
              accountIdentifier: "0123456789",
              accountName: "Provider / Ada Obi",
              amountToTransfer: "50000",
              currency: "NGN",
              validUntil: "2026-11-24T10:05:00Z",
            },
          },
        },
        201
      )
    );
    const res = await POST(post("orders/onramp", onramp), ctx("orders/onramp"));
    expect(res.status).toBe(200);
    expect(sentBody().destination.recipient).toEqual({ address: WALLET, network: "base" });
  });

  it("rejects bad KYC without echoing the values back", async () => {
    signedIn();
    const res = await POST(
      post("orders/onramp", { ...onramp, kyc: { ...onramp.kyc, idNumber: "123" } }),
      ctx("orders/onramp")
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("kyc.idNumber");
    expect(text).not.toContain('123"');
  });

  it("refuses when the account has no wallet yet", async () => {
    signedIn(null);
    const res = await POST(post("orders/offramp", offramp), ctx("orders/offramp"));
    expect(res.status).toBe(409);
  });

  it("answers Paycrest's not-configured state as 503, not a fake order", async () => {
    signedIn();
    vi.stubEnv("PAYCREST_API_KEY", "");
    const res = await POST(post("orders/offramp", offramp), ctx("orders/offramp"));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("NOT_CONFIGURED");
  });
});

describe("order reads", () => {
  function orderOwnedBy(address: string) {
    return upstream({
      status: "success",
      data: {
        ...createdOfframp,
        direction: "offramp",
        source: { type: "crypto", currency: "USDC", network: "base", refundAddress: address },
        destination: { type: "fiat", currency: "NGN", recipient: {} },
      },
    });
  }

  it("returns the caller's own order, whatever the address case", async () => {
    signedIn();
    vi.mocked(fetch).mockReturnValue(orderOwnedBy(WALLET.toLowerCase()));
    const res = await GET(get(`orders/${createdOfframp.id}`), ctx(`orders/${createdOfframp.id}`));
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(createdOfframp.id);
  });

  it("hides another user's order as not found", async () => {
    signedIn();
    vi.mocked(fetch).mockReturnValue(orderOwnedBy(OTHER));
    const res = await GET(get(`orders/${createdOfframp.id}`), ctx(`orders/${createdOfframp.id}`));
    expect(res.status).toBe(404);
  });
});
