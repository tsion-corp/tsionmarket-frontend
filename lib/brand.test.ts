import { describe, expect, it } from "vitest";
import { ARKSTORE_URL } from "@/lib/brand";

describe("ARKSTORE_URL", () => {
  it("opens the Ark app on the ArkStore's own domain, not the beta preview", () => {
    // The promo ticket sent people to the Vercel preview of the store; the
    // maintainers asked for the store's real address (2026-09-13).
    expect(ARKSTORE_URL).toBe("https://www.arkstore.xyz/apps/ark");
  });
});
