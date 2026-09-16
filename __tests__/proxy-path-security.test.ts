import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as tradeGet } from "@/app/api/trade/[...path]/route";
import { GET as predictionGet } from "@/app/api/prediction/[...path]/route";
import { GET as vaultGet } from "@/app/api/vault/[...path]/route";
import { GET as earnGet } from "@/app/api/earn/[...path]/route";

function makeReq(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    headers: new Headers(headers),
  });
}

describe("Proxy Route Path Traversal Security", () => {
  it("rejects path traversal in /api/trade", async () => {
    const maliciousReq = makeReq("http://localhost:3000/api/trade/../admin");
    const res = await tradeGet(maliciousReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects path traversal in /api/prediction", async () => {
    const maliciousReq = makeReq("http://localhost:3000/api/prediction/%2e%2e/internal");
    const res = await predictionGet(maliciousReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects path traversal in /api/vault", async () => {
    const maliciousReq = makeReq("http://localhost:3000/api/vault/game/../secret");
    const res = await vaultGet(maliciousReq, {
      params: Promise.resolve({ path: ["game", "..", "secret"] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects path traversal in /api/earn", async () => {
    const maliciousReq = makeReq("http://localhost:3000/api/earn/listings/../private");
    const res = await earnGet(maliciousReq, {
      params: Promise.resolve({ path: ["listings", "..", "private"] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});
