import { describe, expect, it } from "vitest";
import type { Prediction } from "@/lib/types";
import { gammaTagCategory, predictionDetailHref } from "./gamma-category";

function market(overrides: Partial<Prediction> = {}): Prediction {
  return {
    tag: "Politics",
    vol: "$4.2M vol",
    q: "Will the US cut rates before Q4 2026?",
    yes: "68¢",
    no: "32¢",
    pct: 68,
    eventId: "481717",
    tagLabels: ["Politics", "Elections"],
    ...overrides,
  };
}

describe("gammaTagCategory", () => {
  it("maps a Polymarket tag onto the app's own category", () => {
    expect(gammaTagCategory(["Politics"])).toBe("politics");
    expect(gammaTagCategory(["Crypto Prices"])).toBe("crypto");
    expect(gammaTagCategory(["Fed Rates"])).toBe("finance");
    expect(gammaTagCategory(["CPI Release"])).toBe("economy");
    expect(gammaTagCategory(["Awards"])).toBe("culture");
    expect(gammaTagCategory(["Artificial Intelligence"])).toBe("tech");
  });

  it("matches a label whatever case and padding the feed sends it in", () => {
    expect(gammaTagCategory(["  gLoBaL eLeCtIoNs "])).toBe("politics");
  });

  it("takes the first label it recognises and steps over the ones it does not", () => {
    // Gamma lists tags broad to narrow with place names mixed in. "Iran" says
    // nothing about which category the market belongs to; "Geopolitics" does.
    expect(gammaTagCategory(["Iran", "Geopolitics", "Middle East"])).toBe("politics");
  });

  it("reads Polymarket's 'Games' as a sports fixture, not as video games", () => {
    // The trap in this vocabulary: Games is what Polymarket tags a match with.
    expect(gammaTagCategory(["Games", "Soccer"])).toBe("sports");
  });

  it("returns null when no label means anything to this app", () => {
    expect(gammaTagCategory(["Weather", "Daily Temperature", "Hong Kong"])).toBeNull();
    expect(gammaTagCategory([])).toBeNull();
    expect(gammaTagCategory(undefined)).toBeNull();
  });
});

describe("predictionDetailHref", () => {
  it("points a mapped market at the category event route", () => {
    expect(predictionDetailHref(market())).toBe(
      "/prediction/event/481717?source=markets&category=politics"
    );
  });

  it("carries the category its tags resolved to, not the one the card prints", () => {
    // `tag` is display text picked for length. The route gets the category the
    // full tag list resolves to, so a card labelled "Bitcoin" opens crypto.
    expect(predictionDetailHref(market({ tag: "Bitcoin", tagLabels: ["Crypto", "Bitcoin"] }))).toBe(
      "/prediction/event/481717?source=markets&category=crypto"
    );
  });

  it("gives an unmappable market no destination at all", () => {
    // The safe outcome. Without a category the route falls through to the
    // sportsbook, which would draw a weather market as a football fixture.
    expect(predictionDetailHref(market({ tagLabels: ["Weather", "Highest temperature"] }))).toBe(
      undefined
    );
    expect(predictionDetailHref(market({ tagLabels: [] }))).toBe(undefined);
    expect(predictionDetailHref(market({ tagLabels: undefined }))).toBe(undefined);
  });

  it("sends a sports market to the discovery detail, marked so the route knows", () => {
    // Without `source=markets` this id would be read as a sportsbook fixture,
    // which numbers its events separately: the same number, a different match.
    expect(predictionDetailHref(market({ tagLabels: ["Sports", "Games", "NFL"] }))).toBe(
      "/prediction/markets/481717?category=sports&source=markets"
    );
  });

  it("gives a market with no event id no destination", () => {
    // The static fallback set has no ids. Its cards are display-only.
    expect(predictionDetailHref(market({ eventId: undefined }))).toBe(undefined);
  });
});

// The tag lists below are copied verbatim from the live Gamma feed (the top 60
// events by 24h volume, 9 September 2026) through /api/predictions. Hand-picked
// fixtures proved the mapping could work; only real tag lists prove it does.
// This block is the guard against the mapping being wired and inert.
const DESK_FEED: ReadonlyArray<{ eventId: string; q: string; tagLabels: string[] }> = [
  {
    eventId: "980908",
    q: "US Open ATP: Completed Match: Ben Shelton vs Carlos Alcaraz",
    tagLabels: ["Tennis", "Sports", "Games"],
  },
  {
    eventId: "659671",
    q: "Will another team win the 2026-27 UEFA Champions League?",
    tagLabels: ["UCL", "Soccer", "Sports", "Champions League", "UCL Matchday"],
  },
  {
    eventId: "481717",
    q: "Will there be no change in Fed interest rates after the September meeting?",
    tagLabels: [
      "fomc",
      "Economic Policy",
      "Fed Rates",
      "Jerome Powell",
      "Politics",
      "Fed",
      "Economy",
      "CPI Release",
      "Jobs Report",
    ],
  },
  {
    eventId: "45915",
    q: "Will Luiz Inácio Lula da Silva win the 2026 Brazilian presidential election?",
    tagLabels: [
      "Politics",
      "Macro Election 2",
      "Main Election",
      "Brazil",
      "Global Elections",
      "World Elections",
      "World",
    ],
  },
  {
    eventId: "149589",
    q: "Will United Russia (ER) gain the most seats in the next Russian election?",
    tagLabels: [
      "Politics",
      "International Election Props",
      "World Elections",
      "Elections",
      "Global Elections",
      "putin",
      "Russia",
      "World",
    ],
  },
  {
    eventId: "953427",
    q: "Will the game go to extra innings?: Toronto Blue Jays vs. Atlanta Braves",
    tagLabels: ["Sports", "Games", "MLB", "baseball"],
  },
  {
    eventId: "31875",
    q: "Will J.D. Vance win the 2028 Republican presidential nomination?",
    tagLabels: [
      "United States",
      "Politics",
      "US Election",
      "Elections",
      "World Elections",
      "Global Elections",
      "Earn 4%",
      "Primaries",
    ],
  },
  {
    eventId: "139236",
    q: "Will Carlos Alcaraz win the 2026 Men's US Open?",
    tagLabels: ["US Open", "Sports", "ATP", "Tennis"],
  },
  {
    eventId: "953953",
    q: "Will the price of Bitcoin be above $78,000 on September 9?",
    tagLabels: ["Bitcoin", "Multi Strikes", "Crypto", "Crypto Prices"],
  },
  {
    eventId: "983493",
    q: "LAPTOP FDV above $250M one day after launch?",
    tagLabels: [
      "FDV",
      "Biden",
      "Crypto",
      "laptop",
      "$LAPTOP",
      "Politics",
      "Memecoins",
      "Pre-Market",
      "Hunter Biden",
    ],
  },
  {
    eventId: "985444",
    q: "Game 3: Ends in Daytime?",
    tagLabels: ["Esports", "Dota 2", "Games", "Sports"],
  },
  {
    eventId: "907966",
    q: "Will oil close above $70 this week?",
    tagLabels: ["Finance", "Hit Price", "Finance Updown", "Pyth Finance", "Commodities", "Oil"],
  },
  {
    eventId: "945718",
    q: "How many times will Elon Musk tweet this week?",
    tagLabels: ["Culture", "Politics", "Tweet Markets"],
  },
  {
    eventId: "267102",
    q: "Will Mojtaba Khamenei be the next Supreme Leader of Iran?",
    tagLabels: [
      "Iran Regime",
      "Iran",
      "Mojtaba Khamenei",
      "Khamenei",
      "Geopolitics",
      "Kharg Island",
      "Strait of Hormuz",
      "U.S. x Iran",
      "Iran Ceasefire",
    ],
  },
  {
    eventId: "90375",
    q: "Which Democrat wins the New Hampshire House primary?",
    tagLabels: [
      "primary elections",
      "House Primary",
      "Democratic Primary",
      "New Hampshire Primary",
      "September 8 Primaries",
      "US Election",
      "Politics",
      "Elections",
      "September 8 and 9 Primaries",
      "Primaries",
    ],
  },
];

// The contract the market detail route enforces on its own inputs: a decimal
// event id in the path, one of the seven categories, and the `source=markets`
// marker that tells the route to serve this id from the discovery feed rather
// than the sportsbook. An href that fails this is a 404 or the wrong screen,
// and dropping the marker on a sports link is exactly the wrong screen.
const ROUTE_CONTRACT =
  /^(?:\/prediction\/event\/\d+\?source=markets&category=(?:politics|crypto|finance|tech|culture|economy)|\/prediction\/markets\/\d+\?category=sports&source=markets)$/u;

const feedMarket = (fixture: (typeof DESK_FEED)[number]): Prediction => ({
  tag: fixture.tagLabels[0],
  vol: "$1.2M vol",
  q: fixture.q,
  yes: "51¢",
  no: "49¢",
  pct: 51,
  eventId: fixture.eventId,
  tagLabels: fixture.tagLabels,
});

describe("predictionDetailHref against the live Gamma feed", () => {
  const linked = DESK_FEED.filter((fixture) => predictionDetailHref(feedMarket(fixture)));
  const sports = DESK_FEED.filter((fixture) => gammaTagCategory(fixture.tagLabels) === "sports");

  it("links a real market rather than being wired and inert", () => {
    // The failure this catches: the plumbing lands, every tag falls through the
    // table, and every card ships with no destination. One real market linking
    // is the floor; the desk shows twelve.
    expect(linked.length).toBeGreaterThan(0);
  });

  it("gives every non-sports market on the feed a destination", () => {
    const stranded = DESK_FEED.filter(
      (fixture) =>
        gammaTagCategory(fixture.tagLabels) !== "sports" &&
        !predictionDetailHref(feedMarket(fixture))
    ).map((fixture) => fixture.q);

    expect(stranded).toEqual([]);
  });

  it("builds every href to the contract the detail route enforces", () => {
    for (const fixture of linked) {
      expect(predictionDetailHref(feedMarket(fixture))).toMatch(ROUTE_CONTRACT);
    }
  });

  it("links the feed's sports and esports fixtures like any other market", () => {
    // Sports is the feed's largest bucket, because same-day fixtures dominate
    // 24h volume, so it is most of what the desk shows and the first thing a
    // user clicks. It was refused for as long as the detail route read sports
    // as the sportsbook's; `source=markets` settles that, and these cards open
    // on the discovery detail off their own Gamma ids.
    expect(sports.length).toBeGreaterThan(0);
    for (const fixture of sports) {
      expect(predictionDetailHref(feedMarket(fixture))).toBe(
        `/prediction/markets/${fixture.eventId}?category=sports&source=markets`
      );
    }
  });

  it("leaves no market on the feed without a destination", () => {
    // The report this fixes, stated as the desk sees it: every card the desk
    // draws opens something. The eight the desktop grid shows are the first
    // eight here, and two of those were sports.
    const dead = DESK_FEED.filter((fixture) => !predictionDetailHref(feedMarket(fixture))).map(
      (fixture) => fixture.q
    );

    expect(dead).toEqual([]);
  });
});
