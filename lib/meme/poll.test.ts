import { describe, expect, it } from "vitest";
import { memePollUnlessFailing } from "@/lib/meme/poll";

const query = (status: string) => ({ state: { status } });

// The memecoin polls sit either side of the app-wide sixty second failing
// cadence: the swap feed is faster than it, trending is far slower. A single
// fixed number cannot serve both, because for the slow one it is a speed-up,
// and a ten minute trending cadence is what the service was rescued with.
describe("memePollUnlessFailing", () => {
  it("keeps the healthy cadence while the read is answering", () => {
    const poll = memePollUnlessFailing(15_000);
    expect(poll(query("success"))).toBe(15_000);
    expect(poll(query("pending"))).toBe(15_000);
  });

  it("backs a fast feed off to at least the app-wide failing cadence", () => {
    const failing = memePollUnlessFailing(15_000)(query("error"));
    expect(failing).toBeGreaterThanOrEqual(60_000);
  });

  it("never asks a failing read for more often than the healthy cadence", () => {
    const tenMinutes = 10 * 60_000;
    expect(memePollUnlessFailing(tenMinutes)(query("error"))).toBeGreaterThanOrEqual(tenMinutes);
  });

  it("slows a read that is already slower than the app-wide cadence", () => {
    const tenMinutes = 10 * 60_000;
    expect(memePollUnlessFailing(tenMinutes)(query("error"))).toBeGreaterThan(tenMinutes);
  });

  it("backs off rather than stopping, so a recovered service is noticed", () => {
    const failing = memePollUnlessFailing(60_000)(query("error"));
    expect(Number.isFinite(failing)).toBe(true);
    expect(failing).toBeGreaterThan(0);
  });
});
