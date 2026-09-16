import { describe, expect, it } from "vitest";
import { pollUnlessFailing, pollUnlessFailingOr } from "@/lib/query-poll";

const q = (status: string) => ({ state: { status } });

// The helper exists because React Query keeps firing `refetchInterval` while
// every attempt errors, and the default retry turns each tick into three
// requests. A permanently failing endpoint is otherwise polled at its healthy
// rate for as long as the tab is open.
describe("pollUnlessFailing", () => {
  it("keeps the healthy cadence while the query is fine", () => {
    expect(pollUnlessFailing(15_000)(q("success"))).toBe(15_000);
    expect(pollUnlessFailing(15_000)(q("pending"))).toBe(15_000);
  });

  it("drops to a slow cadence while the query is failing", () => {
    const failing = pollUnlessFailing(15_000)(q("error"));
    expect(failing).toBeGreaterThan(15_000);
  });

  it("backs off rather than stopping, so a recovered service is noticed", () => {
    expect(pollUnlessFailing(15_000)(q("error"))).not.toBe(false);
  });
});

describe("pollUnlessFailingOr", () => {
  it("keeps an idle query idle, failing or not", () => {
    expect(pollUnlessFailingOr(false)(q("error"))).toBe(false);
    expect(pollUnlessFailingOr(false)(q("success"))).toBe(false);
  });

  it("backs off a conditional poll that is failing", () => {
    expect(pollUnlessFailingOr(2_000)(q("error"))).toBeGreaterThan(2_000);
    expect(pollUnlessFailingOr(2_000)(q("success"))).toBe(2_000);
  });
});
