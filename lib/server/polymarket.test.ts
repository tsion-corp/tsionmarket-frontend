import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPredictions } from "@/lib/server/polymarket";

// One Gamma event, shaped the way the live feed shapes it: outcomes and prices
// arrive as JSON strings, and the tags are free text.
function gammaEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "481717",
    volume: 4_200_000,
    tags: [{ label: "Politics" }, { label: "Recurring" }, { label: "Global Elections" }],
    markets: [
      {
        question: "Will the US cut rates before Q4 2026?",
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.68","0.32"]',
        volumeNum: 4_200_000,
        clobTokenIds: '["yes-token","no-token"]',
        conditionId: "0xcondition",
      },
    ],
    ...overrides,
  };
}

function stubGamma(events: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(events),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchPredictions", () => {
  it("carries the event id and the event's tag labels into the domain object", async () => {
    stubGamma([gammaEvent()]);

    const [prediction] = await fetchPredictions();

    // The event id is what the market detail route is keyed by. Without it on
    // the domain object the card has nothing to link to.
    expect(prediction.eventId).toBe("481717");
    // Every tag that says something about the market, in feed order, with the
    // housekeeping ones dropped. "Recurring" is housekeeping.
    expect(prediction.tagLabels).toEqual(["Politics", "Global Elections"]);
  });

  it("drops an event id the market detail route would reject", async () => {
    // The route tests the id against /^\d+$/ and 404s on anything else, so a
    // slug here has to become no id rather than a link to a missing page.
    stubGamma([gammaEvent({ id: "us-rate-cut-2026" })]);

    const [prediction] = await fetchPredictions();

    expect(prediction.eventId).toBeUndefined();
    expect(prediction.q).toBe("Will the US cut rates before Q4 2026?");
  });

  it("accepts an event id sent as a number", async () => {
    stubGamma([gammaEvent({ id: 481_717 })]);

    const [prediction] = await fetchPredictions();

    expect(prediction.eventId).toBe("481717");
  });

  it("keeps printing the first short tag on the card", async () => {
    // The display tag skips labels too long for the card's footer. Collecting
    // every label for the category mapping must not change what is printed.
    stubGamma([
      gammaEvent({
        tags: [{ label: "International Election Props" }, { label: "Politics" }],
      }),
    ]);

    const [prediction] = await fetchPredictions();

    expect(prediction.tag).toBe("Politics");
    expect(prediction.tagLabels).toEqual(["International Election Props", "Politics"]);
  });

  it("refuses a body that is not a list of events", async () => {
    // Gamma has no envelope, so a 200 carrying an error object would otherwise
    // be iterated as if it were the feed. The route turns this into a 502.
    stubGamma({ error: "rate limited" } as unknown as unknown[]);

    await expect(fetchPredictions()).rejects.toThrow("Polymarket events response was not an array");
  });

  it("drops only the events that no longer match the Gamma contract", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // `markets` typed as a string rather than a list is the shape of drift that
    // used to reach the mapper untyped. One bad event must not blank the desk.
    stubGamma([gammaEvent({ id: "1", markets: "not-a-list" }), gammaEvent({ id: "2" })]);

    const predictions = await fetchPredictions();

    expect(predictions).toHaveLength(1);
    expect(predictions[0].eventId).toBe("2");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("dropped 1 of 2 events"));
  });

  it("keeps mapping an event that carries fields this app does not model", async () => {
    // The schema pins the fields this module reads and ignores the rest, so
    // Gamma adding a field is not an outage.
    stubGamma([gammaEvent({ negRiskAugmented: true, series: [{ id: "9" }] })]);

    const [prediction] = await fetchPredictions();

    expect(prediction.eventId).toBe("481717");
  });

  it("carries the volume as a number as well as a formatted string", async () => {
    // The formatted string is dollars. Any surface that shows the figure in the
    // reader's own currency needs the amount itself to hand to the money layer,
    // so both travel on the domain object.
    stubGamma([gammaEvent()]);

    const [prediction] = await fetchPredictions();

    expect(prediction.volumeUsd).toBe(4_200_000);
    expect(prediction.vol).toBe("$4.2M vol");
  });

  it("carries no volume number when Gamma states no volume", async () => {
    // Zero is Gamma saying nothing, not a market that traded nothing, and an
    // invented "$0" would read as a fact. The field is left off instead.
    stubGamma([
      gammaEvent({
        volume: undefined,
        markets: [{ ...gammaEvent().markets[0], volumeNum: undefined }],
      }),
    ]);

    const [prediction] = await fetchPredictions();

    expect(prediction.volumeUsd).toBeUndefined();
    expect(prediction.vol).toBe("");
  });

  it("carries the event's close date through as the market deadline", async () => {
    stubGamma([gammaEvent({ endDate: "2027-02-22T15:30:00Z" })]);

    const [prediction] = await fetchPredictions();

    expect(prediction.endsAt).toBe("2027-02-22T15:30:00Z");
  });

  it("carries no deadline when Gamma states no close date", async () => {
    stubGamma([gammaEvent()]);

    const [prediction] = await fetchPredictions();

    expect(prediction.endsAt).toBeUndefined();
  });

  it("raises the upstream failure rather than returning an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve([]) })
    );

    await expect(fetchPredictions()).rejects.toThrow("Polymarket events failed: 503");
  });
});
