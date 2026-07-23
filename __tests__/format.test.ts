import { describe, expect, it } from "vitest";
import { parseMoney, truncateAddress } from "@/lib/format";
import { HOLDINGS } from "@/lib/data/dashboard";

describe("truncateAddress", () => {
  it("keeps the first six and last four characters", () => {
    expect(truncateAddress("0x1234567890abcdef1234567890abcdefabcd")).toBe("0x1234…abcd");
  });

  it("returns short addresses unchanged", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });
});

describe("portfolio balance", () => {
  it("aggregates the demo holdings to the expected total", () => {
    const total = HOLDINGS.reduce((sum, h) => sum + parseMoney(h.value), 0);
    expect(total).toBe(48215);
  });
});
