import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearUpstreamFailoverCache,
  fetchUpstreamRead,
  fetchUpstreamWrite,
  upstreamCandidates,
} from "@/lib/server/upstream-failover";

afterEach(() => {
  clearUpstreamFailoverCache();
  vi.restoreAllMocks();
});

describe("upstream failover", () => {
  it("splits comma-separated URLs, trims them, and preserves priority", () => {
    expect(
      upstreamCandidates(
        " https://primary.example/v1/chess/, https://backup.example/v1/chess ",
        "https://primary.example/v1/chess"
      )
    ).toEqual(["https://primary.example/v1/chess", "https://backup.example/v1/chess"]);
  });

  it("fails a read over after a retryable response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const response = await fetchUpstreamRead(
      ["https://primary.example", "https://backup.example"],
      "rounds/current?limit=1",
      { method: "GET" },
      1_000
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://backup.example/rounds/current?limit=1",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("does not hide client or authentication errors behind a fallback", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    const response = await fetchUpstreamRead(
      ["https://primary.example", "https://backup.example"],
      "cashier/balance",
      { method: "GET" },
      1_000
    );

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("selects the first ready upstream and submits a write only once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url === "https://primary.example/ready") {
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      if (url === "https://backup.example/ready") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      expect(init?.method).toBe("POST");
      return Promise.resolve(new Response('{"accepted":true}', { status: 201 }));
    });

    const response = await fetchUpstreamWrite(
      ["https://primary.example", "https://backup.example"],
      "bets",
      { method: "POST", body: '{"amount":2}' },
      1_000
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://backup.example/bets",
      expect.objectContaining({ method: "POST", body: '{"amount":2}' })
    );
  });

  it("does not wait for an unresponsive fallback when one upstream is ready", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url === "https://primary.example/ready") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url === "https://backup.example/ready") {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        });
      }
      return Promise.resolve(new Response('{"accepted":true}', { status: 201 }));
    });

    const response = await fetchUpstreamWrite(
      ["https://primary.example", "https://backup.example"],
      "matches/match-1/moves",
      { method: "POST", body: '{"uci":"e2e4"}' },
      1_000
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://primary.example/matches/match-1/moves",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not submit a write when no candidate is ready", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      fetchUpstreamWrite(
        ["https://primary.example", "https://backup.example"],
        "cashier/withdrawals",
        { method: "POST", body: "{}" },
        1_000
      )
    ).rejects.toThrow("No configured upstream is ready.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith("/ready"))).toBe(true);
  });
});
