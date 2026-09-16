import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSupportChatMessage } from "./client";

describe("sendSupportChatMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns parsed json when response is ok", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          reply: "Hello from AI",
          needsHuman: false,
        }),
        { status: 200 }
      )
    );

    const result = await sendSupportChatMessage("hi");
    expect(result).toEqual({
      ok: true,
      reply: "Hello from AI",
      needsHuman: false,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/support-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
  });

  it("handles non-ok responses with error message", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "Rate limited" }), {
        status: 429,
      })
    );

    const result = await sendSupportChatMessage("test");
    expect(result).toEqual({
      ok: false,
      error: "Rate limited",
    });
  });
});
