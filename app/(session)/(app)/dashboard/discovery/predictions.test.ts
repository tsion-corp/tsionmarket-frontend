// @vitest-environment jsdom
// This suite renders, so it needs a DOM. vitest.config.ts puts .ts suites in
// the node project to avoid booting jsdom for the many that never touch it;
// the pragma above opts this one back in, per that config's own note.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prediction } from "@/lib/types";

const usePredictions = vi.fn();
vi.mock("@/features/prediction/hooks/use-predictions", () => ({
  usePredictions: () => usePredictions(),
}));

const { usePredictionSpots } = await import("./predictions");

const market = (over: Partial<Prediction> = {}): Prediction => ({
  tag: "Politics",
  vol: "$1.2M vol",
  q: "Will there be no change in Fed interest rates?",
  yes: "51¢",
  no: "49¢",
  pct: 51,
  image: "https://cdn.example/fed.jpg",
  eventId: "481717",
  // The first recognised label decides the category, so this market opens
  // politics rather than finance even though "Fed Rates" is in the list.
  tagLabels: ["Politics", "Fed Rates"],
  endsAt: "2026-09-16T00:00:00Z",
  ...over,
});

const feed = (predictions: Prediction[] | undefined) => {
  usePredictions.mockReturnValue({ data: predictions });
};

beforeEach(() => {
  usePredictions.mockReset();
});

describe("usePredictionSpots", () => {
  it("maps a market onto the card's shape", () => {
    feed([market()]);
    const { result } = renderHook(() => usePredictionSpots());

    expect(result.current).toEqual([
      {
        id: "481717",
        question: "Will there be no change in Fed interest rates?",
        closesAt: Date.UTC(2026, 8, 16, 0, 0, 0),
        images: ["https://cdn.example/fed.jpg"],
        href: "/prediction",
      },
    ]);
  });

  it("hands the card nothing rather than a sample when the feed is empty", () => {
    // The defect this replaces: the row was mounted with no markets prop at
    // all, so the rotation had nothing to rotate and the card showed the
    // design's own sample market on every dashboard, forever.
    feed([]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current).toEqual([]);
  });

  it("survives a feed that has not resolved yet", () => {
    feed(undefined);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current).toEqual([]);
  });

  it("passes the close time through as an instant, never as a clock face", () => {
    // The countdown used to be a string typed into the message catalogue. The
    // card has to tick it, so what it receives is the raw moment.
    feed([market({ endsAt: "2027-05-30T23:59:00Z" })]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current[0].closesAt).toBe(Date.UTC(2027, 4, 30, 23, 59, 0));
  });

  it("reports no deadline for a market the feed gave no end date", () => {
    feed([market({ endsAt: undefined })]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current[0].closesAt).toBeNull();
  });

  it("reports no deadline rather than NaN for an unparseable end date", () => {
    feed([market({ endsAt: "whenever" })]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current[0].closesAt).toBeNull();
  });

  it("drops a market with no question, which is the whole card", () => {
    feed([market({ q: "   " }), market({ eventId: "999", q: "Real question?" })]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current.map((s) => s.question)).toEqual(["Real question?"]);
  });

  it("drops a market with no event id, which cannot be keyed or opened", () => {
    feed([market({ eventId: undefined })]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current).toEqual([]);
  });

  it("draws no tile rather than a placeholder when a market has no artwork", () => {
    feed([market({ image: null })]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current[0].images).toEqual([]);
  });

  it("falls back to the desk for a market with no category to open", () => {
    // An unmappable tag list has no detail route. The desk is the honest
    // destination; a fabricated category would open the wrong screen.
    feed([market({ tagLabels: ["Weather", "Hong Kong"] })]);
    const { result } = renderHook(() => usePredictionSpots());
    expect(result.current[0].href).toBe("/prediction");
  });

  it("features at most five, in the order the feed ranked them", () => {
    feed(Array.from({ length: 12 }, (_, i) => market({ eventId: `${100 + i}`, q: `Q${i}?` })));
    const { result } = renderHook(() => usePredictionSpots());

    expect(result.current).toHaveLength(5);
    expect(result.current.map((s) => s.question)).toEqual(["Q0?", "Q1?", "Q2?", "Q3?", "Q4?"]);
  });

  it("holds the same array across a refetch that changed nothing", () => {
    // A fresh array is a fresh set of cards to the row, which would restart the
    // ten second rotation mid-cycle on every background refetch.
    feed([market()]);
    const { result, rerender } = renderHook(() => usePredictionSpots());
    const first = result.current;

    feed([market()]);
    rerender();

    expect(result.current).toBe(first);
  });

  it("passes on a real change", () => {
    feed([market()]);
    const { result, rerender } = renderHook(() => usePredictionSpots());
    const first = result.current;

    feed([market({ q: "A different market?" })]);
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current[0].question).toBe("A different market?");
  });
});
