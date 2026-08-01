import { describe, expect, it } from "vitest";
import { unwrap } from "@/lib/api/envelope";

describe("unwrap", () => {
  it("returns the data from a normal envelope", async () => {
    const res = new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(unwrap<{ ok: boolean }>(res, "fallback")).resolves.toEqual({ ok: true });
  });

  it("preserves a plain-text upstream error message", async () => {
    const res = new Response("missing field `amountUsdc` at line 1 column 42", {
      status: 422,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });

    await expect(unwrap(res, "fallback")).rejects.toMatchObject({
      code: "BAD_RESPONSE",
      status: 422,
      message: "missing field `amountUsdc` at line 1 column 42",
    });
  });

  it("keeps envelope error codes when the body is JSON", async () => {
    const res = new Response(
      JSON.stringify({
        success: false,
        error: { code: "CONFLICT", message: "insufficient available balance" },
      }),
      {
        status: 409,
        headers: { "content-type": "application/json" },
      }
    );

    await expect(unwrap(res, "fallback")).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "insufficient available balance",
    });
  });
});
