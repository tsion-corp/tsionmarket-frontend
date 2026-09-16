import { describe, expect, it } from "vitest";
import {
  comboEventSchema,
  comboEventsSchema,
  comboFiltersSchema,
  comboQuoteSchema,
  comboTeamSchema,
  discoveryEventsSchema,
  predictionComboSchemaFor,
  singlesTicketSchema,
  sportsEventsSchema,
  sportsFiltersSchema,
} from "./prediction-combos";

describe("prediction Combo schemas", () => {
  it("only exposes the supported discovery contracts", () => {
    expect(predictionComboSchemaFor("sports/combo-filters")).toBe(comboFiltersSchema);
    expect(predictionComboSchemaFor("sports/combo-events")).toBe(comboEventsSchema);
    expect(predictionComboSchemaFor("sports/combo-events/831378")).toBe(comboEventSchema);
    expect(predictionComboSchemaFor("sports/teams")).toEqual(expect.anything());
    expect(predictionComboSchemaFor("sports/teams")?.safeParse([]).success).toBe(true);
    expect(
      predictionComboSchemaFor("sports/teams")?.safeParse([
        {
          id: 42,
          name: "Pakhtakor",
          alias: null,
          abbreviation: "PAK",
          record: "0-0",
          logoUrl: "https://example.com/pakhtakor.png",
          color: "#3d3881",
          ordering: null,
        },
      ]).success
    ).toBe(true);
    expect(comboTeamSchema.safeParse({ name: "Incomplete" }).success).toBe(false);
    expect(predictionComboSchemaFor("sports/combo-events/not-an-id")).toBeNull();
    expect(predictionComboSchemaFor("sports/filters")).toBe(sportsFiltersSchema);
    expect(predictionComboSchemaFor("sports/events")).toBe(sportsEventsSchema);
    expect(predictionComboSchemaFor("sports/events/831378")).toBe(comboEventSchema);
    expect(predictionComboSchemaFor("sports/events/not-an-id")).toBeNull();
    expect(predictionComboSchemaFor("combos/quotes")).toBe(comboQuoteSchema);
    expect(predictionComboSchemaFor("singles/tickets")).toBe(singlesTicketSchema);
    expect(predictionComboSchemaFor("singles/tickets/YN65GR")).toBe(singlesTicketSchema);
    expect(predictionComboSchemaFor("singles/tickets/yn65gr")).toBe(singlesTicketSchema);
  });

  it("accepts a durable Singles ticket contract", () => {
    expect(
      singlesTicketSchema.safeParse({
        id: "4be8c170-c34e-4c12-a90c-2d9dfe8af094",
        bookingCode: "YN65GR",
        status: "filled",
        requestedStakeE6: "1000000",
        spentE6: "995000",
        referenceReturnE6: "2000000",
        filledCount: 1,
        acceptedCount: 1,
        orders: [
          {
            selectionId: "market-1:yes",
            source: "discovery",
            eventId: "event-1",
            eventTitle: "Event one",
            marketId: "market-1",
            conditionId: "condition-1",
            tokenId: "123456",
            marketLabel: "Will it happen?",
            outcome: "Yes",
            status: "filled",
            orderId: "order-1",
            transactionHash: null,
            error: null,
          },
        ],
        placedAt: "2026-08-26T12:00:00Z",
        createdAt: "2026-08-26T12:00:01Z",
        updatedAt: "2026-08-26T12:00:01Z",
      }).success
    ).toBe(true);
  });

  it("accepts the durable Combo quote contract", () => {
    expect(
      comboQuoteSchema.safeParse({
        id: "4be8c170-c34e-4c12-a90c-2d9dfe8af094",
        rfqId: "rfq-1",
        quoteId: "quote-1",
        direction: "BUY",
        requestedUnit: "notional",
        requestedValueE6: "100000",
        legPositionIds: ["123", "456"],
        comboConditionId: "condition",
        comboYesPositionId: "789",
        comboNoPositionId: "1011",
        builderCode: "0x1234",
        status: "AWAITING_REQUESTER_ACCEPTANCE",
        expiresAt: "2026-08-26T12:00:00Z",
        blendedPriceE6: "250000",
        makerAmountE6: "100000",
        takerAmountE6: "400000",
        totalRequiredE6: "100000",
        netReceiveE6: "400000",
        takerOrderHash: null,
        transactionHash: null,
        errorCode: null,
        errorMessage: null,
        acceptedAt: null,
        finalizedAt: null,
        lastSyncedAt: null,
        createdAt: "2026-08-26T11:59:00Z",
        updatedAt: "2026-08-26T11:59:01Z",
      }).success
    ).toBe(true);
  });

  it("rejects an invalid executable price", () => {
    const result = comboEventsSchema.safeParse({
      sport: "soccer",
      league: null,
      nextCursor: null,
      events: [
        {
          id: "event-1",
          slug: "home-away",
          title: "Home vs Away",
          startTime: "2026-08-28T19:00:00Z",
          eventDate: "2026-08-28",
          live: false,
          volume: 10,
          liquidity: 20,
          league: { slug: "epl", name: "Premier League", imageUrl: null },
          teams: [],
          moneyline: [
            {
              id: "market-1",
              conditionId: "condition-1",
              slug: "home",
              question: "Will Home win?",
              label: "Home",
              marketType: "moneyline",
              line: null,
              positionIds: [],
              volume: 10,
              liquidity: 20,
              selections: [
                {
                  outcome: "Yes",
                  outcomeIndex: 0,
                  tokenId: "token-1",
                  positionId: "position-1",
                  referencePrice: 1.2,
                  decimalOdds: 0.83,
                },
              ],
            },
          ],
          spreads: [],
          totals: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts every supported discovery category", () => {
    const categories = [
      "trending",
      "sports",
      "politics",
      "crypto",
      "esports",
      "iran",
      "finance",
      "geopolitics",
      "tech",
      "culture",
      "economy",
      "weather",
      "mentions",
      "elections",
    ];

    for (const category of categories) {
      expect(
        discoveryEventsSchema.safeParse({
          category,
          sort: "volume_24h",
          events: [],
          nextCursor: null,
        }).success
      ).toBe(true);
    }

    expect(
      discoveryEventsSchema.safeParse({
        category: "unsupported",
        sort: "volume_24h",
        events: [],
        nextCursor: null,
      }).success
    ).toBe(false);
  });

  it("accepts football and basketball navigation contracts", () => {
    const league = {
      slug: "epl",
      providerSlug: "epl",
      name: "Premier League",
      imageUrl: null,
      seriesId: "10188",
      primaryTagId: 306,
      teamOrdering: "home",
    };

    expect(
      sportsFiltersSchema.safeParse({
        sports: [
          { slug: "football", label: "Football" },
          { slug: "basketball", label: "Basketball" },
        ],
        selectedSport: "football",
        selectedLeague: "epl",
        leagues: [league],
        marketTypes: ["moneyline", "spread", "total"],
      }).success
    ).toBe(true);
    expect(
      sportsEventsSchema.safeParse({
        sport: "football",
        league: null,
        events: [],
        nextCursor: null,
      }).success
    ).toBe(true);
    expect(
      sportsEventsSchema.safeParse({
        sport: "soccer",
        league,
        events: [],
        nextCursor: null,
      }).success
    ).toBe(false);
  });
});
