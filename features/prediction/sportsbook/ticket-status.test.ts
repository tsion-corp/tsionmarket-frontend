import { describe, expect, it } from "vitest";
import { ticketStatusDetail } from "./ticket-status";

describe("ticket status detail", () => {
  it("does not describe a rejected order as settled", () => {
    expect(ticketStatusDetail("rejected", false)).toBe("Order rejected before placement");
  });

  it("shows the latest state while an order is processing", () => {
    expect(ticketStatusDetail("pending_resolution", true)).toBe("Latest state: pending resolution");
  });

  it("keeps settlement confirmation for successful terminal states", () => {
    expect(ticketStatusDetail("redeemed", false)).toBe("Settlement confirmed");
  });
});
