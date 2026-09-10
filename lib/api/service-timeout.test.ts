import { describe, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/api/service";

// A polling reader on a poor connection may ask for its reads to give up
// after a while, so a stuck poll fails and the next one runs. Writes are
// never timed out by the client: the server may still be acting on them.
const calls = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: calls.apiFetch }));

function ok() {
  return new Response(JSON.stringify({ success: true, data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createServiceClient timeoutMs", () => {
  it("attaches a timeout signal to reads and to nothing else", async () => {
    calls.apiFetch.mockImplementation(async () => ok());
    const client = createServiceClient("/api/demo", "down", { timeoutMs: 1_000 });
    await client.get("/x");
    await client.authedGet("/y");
    await client.post("/z", { a: 1 });
    const inits = calls.apiFetch.mock.calls.map((c) => c[1] as RequestInit);
    expect(inits[0].signal).toBeInstanceOf(AbortSignal);
    expect(inits[1].signal).toBeInstanceOf(AbortSignal);
    expect(inits[2].signal).toBeUndefined();
  });

  it("sends reads with no signal when no timeout was asked for", async () => {
    calls.apiFetch.mockImplementation(async () => ok());
    const client = createServiceClient("/api/demo", "down");
    await client.get("/x");
    const init = calls.apiFetch.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });
});
