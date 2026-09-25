import { describe, expect, it } from "vitest";
import { createTranslator, type Messages } from "next-intl";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import pt from "@/messages/pt.json";
import { composeShinePost, looseMoneyIn, type ShineTranslate } from "@/lib/shine/compose";
import {
  entryPriceFromUsdString,
  oddsFromDecimalString,
  pnlPercentFromPoints,
  type EntryPrice,
  type PnlPercent,
} from "@/lib/shine/money";
import type { ShineEvent } from "@/lib/shine/types";
import { LOCALES, type Locale } from "@/lib/i18n";

// The catalogues as data, typed as next-intl types the messages an app is
// configured with. Inferring the literal key union from three thousand keys,
// five times over, would cost type-checking time to prove something these
// tests do not claim: the keys here are chosen by the composer, not named by
// this file.
const CATALOGS: Record<Locale, Messages> = { en, fr, de, es, pt };

/**
 * A real next-intl translator over a real catalogue.
 *
 * Not a stub that substitutes braces: the app renders these strings through
 * ICU, and ICU has opinions about apostrophes and braces that a hand-rolled
 * substituter would not reproduce. A message this cannot format throws here
 * rather than falling back to its own key.
 */
function translatorFor(locale: Locale): ShineTranslate {
  const t = createTranslator({
    locale,
    messages: CATALOGS[locale],
    namespace: "shine.post",
    onError: (error) => {
      throw error;
    },
  });
  return (key, values) => t(key, values);
}

const t = translatorFor("en");

function text(event: ShineEvent, translate: ShineTranslate = t): string {
  const composed = composeShinePost(event, translate);
  if (!composed.ok) throw new Error(`expected a post, got refusal: ${composed.reason}`);
  return composed.text;
}

const price = (usd: string): EntryPrice => {
  const parsed = entryPriceFromUsdString(usd);
  if (parsed === null) throw new Error(`test fixture price is unusable: ${usd}`);
  return parsed;
};

const pnl = (points: string): PnlPercent => {
  const parsed = pnlPercentFromPoints(points);
  if (parsed === null) throw new Error(`test fixture pnl is unusable: ${points}`);
  return parsed;
};

describe("what a post says", () => {
  it("states the memecoin entry, not a verdict about it", () => {
    expect(
      text({
        service: "memecoin",
        id: "s1",
        kind: "buy",
        symbol: "pepe",
        price: price("0.0000042"),
      })
    ).toBe("Aped into $PEPE at $0.0000042.");
  });

  it("puts a closed memecoin position's return in percent", () => {
    expect(
      text({
        service: "memecoin",
        id: "s2",
        kind: "sell",
        symbol: "PEPE",
        price: price("0.0000061"),
        pnl: pnl("45.2"),
      })
    ).toBe("Closed out $PEPE at $0.0000061. +45.2%.");
  });

  it("gives spot its own voice", () => {
    expect(
      text({ service: "spot", id: "r1", kind: "buy", symbol: "SOL", price: price("214.30") })
    ).toBe("Bought $SOL at $214.30 on spot.");
    expect(
      text({
        service: "spot",
        id: "r2",
        kind: "sell",
        symbol: "SOL",
        price: price("230.10"),
        pnl: pnl("7.4"),
      })
    ).toBe("Sold $SOL at $230.10 on spot. +7.4%.");
  });

  it("names a real-world asset as one", () => {
    expect(
      text({ service: "rwa", id: "req1", kind: "buy", symbol: "OUSG", price: price("109.42") })
    ).toBe("Bought the real-world asset $OUSG at $109.42.");
  });

  it("says what the prediction fill actually was", () => {
    expect(
      text({
        service: "prediction",
        id: "o1",
        market: "Will BTC close above $100k in 2026?",
        outcome: "Yes",
        price: price("0.62"),
      })
    ).toBe('Took "Yes" on "Will BTC close above $100k in 2026?" at $0.62 a share.');
  });

  it("reads like a perps entry, with no outcome claimed", () => {
    expect(
      text({
        service: "perps",
        id: "p1",
        kind: "open",
        symbol: "BTC-PERP",
        side: "long",
        leverage: 5,
        price: price("64200"),
      })
    ).toBe("Opened a 5x long on BTC-PERP at $64,200.00.");
    expect(
      text({
        service: "perps",
        id: "p2",
        kind: "close",
        symbol: "BTC-PERP",
        side: "long",
        price: price("67410"),
        pnl: pnl("24.9"),
      })
    ).toBe("Closed my long on BTC-PERP at $67,410.00. +24.9%.");
  });

  it("reads like a game, not a trade", () => {
    expect(
      text({ service: "arcade", id: "m1", game: "chess", outcome: "won", pnl: pnl("180") })
    ).toBe("Won at chess in the arcade. +180%.");
    expect(
      text({ service: "arcade", id: "m2", game: "ArkBall", outcome: "drawn", pnl: null })
    ).toBe("Drew at ArkBall in the arcade.");
  });

  it("reads like a bet slip", () => {
    expect(
      text({
        service: "sports",
        id: "t1",
        kind: "placed",
        event: "Arsenal vs Chelsea",
        selection: "Arsenal to win",
        odds: oddsFromDecimalString("2.1"),
      })
    ).toBe("Backed Arsenal to win in Arsenal vs Chelsea at odds of 2.10.");
    expect(
      text({
        service: "sports",
        id: "t2",
        kind: "won",
        event: "Arsenal vs Chelsea",
        selection: "Arsenal to win",
        pnl: pnl("110"),
      })
    ).toBe("My ticket on Arsenal to win landed. Arsenal vs Chelsea. +110%.");
  });

  it("drops the clause rather than guessing a figure the app does not have", () => {
    expect(text({ service: "memecoin", id: "s3", kind: "buy", symbol: "PEPE", price: null })).toBe(
      "Aped into $PEPE."
    );
    expect(
      text({
        service: "perps",
        id: "p3",
        kind: "close",
        symbol: "BTC-PERP",
        side: "short",
        price: null,
        pnl: null,
      })
    ).toBe("Closed my short on BTC-PERP.");
  });
});

// Every event a composer can be handed, in both the "the app has the figure"
// and the "it does not" shape, so a locale is exercised on the variants that
// drop a clause as well as the full ones.
const EVERY_EVENT: readonly ShineEvent[] = [
  { service: "memecoin", id: "a1", kind: "buy", symbol: "PEPE", price: price("0.0000042") },
  { service: "memecoin", id: "a2", kind: "buy", symbol: "PEPE", price: null },
  {
    service: "memecoin",
    id: "a3",
    kind: "sell",
    symbol: "PEPE",
    price: price("0.0000061"),
    pnl: pnl("45.2"),
  },
  { service: "memecoin", id: "a4", kind: "sell", symbol: "PEPE", price: null, pnl: null },
  { service: "spot", id: "b1", kind: "buy", symbol: "SOL", price: price("214.30") },
  { service: "spot", id: "b2", kind: "buy", symbol: "SOL", price: null },
  {
    service: "spot",
    id: "b3",
    kind: "sell",
    symbol: "SOL",
    price: price("230.10"),
    pnl: pnl("7.4"),
  },
  { service: "spot", id: "b4", kind: "sell", symbol: "SOL", price: null, pnl: null },
  { service: "rwa", id: "c1", kind: "buy", symbol: "OUSG", price: price("109.42") },
  { service: "rwa", id: "c2", kind: "buy", symbol: "OUSG", price: null },
  {
    service: "rwa",
    id: "c3",
    kind: "sell",
    symbol: "OUSG",
    price: price("110.80"),
    pnl: pnl("1.3"),
  },
  { service: "rwa", id: "c4", kind: "sell", symbol: "OUSG", price: null, pnl: null },
  {
    service: "prediction",
    id: "d1",
    market: "Will BTC close above $100k in 2026?",
    outcome: "Yes",
    price: price("0.62"),
  },
  {
    service: "prediction",
    id: "d2",
    market: "Will BTC close above $100k in 2026?",
    outcome: "Yes",
    price: null,
  },
  {
    service: "perps",
    id: "e1",
    kind: "open",
    symbol: "BTC-PERP",
    side: "long",
    leverage: 5,
    price: price("64200"),
  },
  {
    service: "perps",
    id: "e2",
    kind: "open",
    symbol: "BTC-PERP",
    side: "short",
    leverage: null,
    price: null,
  },
  {
    service: "perps",
    id: "e3",
    kind: "close",
    symbol: "BTC-PERP",
    side: "long",
    price: price("67410"),
    pnl: pnl("24.9"),
  },
  {
    service: "perps",
    id: "e4",
    kind: "close",
    symbol: "BTC-PERP",
    side: "short",
    price: null,
    pnl: null,
  },
  { service: "arcade", id: "f1", game: "chess", outcome: "won", pnl: pnl("180") },
  { service: "arcade", id: "f2", game: "ArkBall", outcome: "drawn", pnl: null },
  {
    service: "sports",
    id: "g1",
    kind: "placed",
    event: "Arsenal vs Chelsea",
    selection: "Arsenal to win",
    odds: oddsFromDecimalString("2.1"),
  },
  {
    service: "sports",
    id: "g2",
    kind: "placed",
    event: "Arsenal vs Chelsea",
    selection: "Arsenal to win",
    odds: null,
  },
  {
    service: "sports",
    id: "g3",
    kind: "won",
    event: "Arsenal vs Chelsea",
    selection: "Arsenal to win",
    pnl: pnl("110"),
  },
];

/** The branded figures this event carries, as they are rendered. */
function figuresOf(event: ShineEvent): string[] {
  return [
    "price" in event && event.price ? String(event.price) : "",
    "pnl" in event && event.pnl ? String(event.pnl) : "",
    "odds" in event && event.odds ? String(event.odds) : "",
  ].filter(Boolean);
}

/**
 * The third-party names this event carries.
 *
 * Removed before the money check for the same reason the composer holds them
 * back from its own guard: "Will BTC close above $100k in 2026?" is a public
 * market's title, not the reader's money.
 */
function namesOf(event: ShineEvent): string[] {
  const fields = ["market", "outcome", "selection", "event", "game"] as const;
  return fields
    .map((field) => (field in event ? String(event[field as keyof ShineEvent]) : ""))
    .filter(Boolean);
}

describe.each(LOCALES)("a post in %s", (locale) => {
  const translate = translatorFor(locale);

  it("composes every event this locale can be asked for", () => {
    for (const event of EVERY_EVENT) {
      const composed = composeShinePost(event, translate);
      expect(composed.ok, `${locale} ${event.service} ${event.id}`).toBe(true);
    }
  });

  it("carries no currency-marked figure but the entry price and the return", () => {
    // The check the composer runs on itself, run again from outside on every
    // locale: a translation that writes a currency symbol into a template
    // trips here, and the post is never published.
    for (const event of EVERY_EVENT) {
      const composed = composeShinePost(event, translate);
      if (!composed.ok) throw new Error(composed.reason);
      let rest = composed.text;
      for (const figure of figuresOf(event)) rest = rest.replace(figure, "");
      for (const third of namesOf(event)) rest = rest.replace(third, "");
      expect(looseMoneyIn(rest), `${locale}: ${composed.text}`).toBeNull();
    }
  });

  it("leaves no dangling clause where the app had no figure", () => {
    for (const event of EVERY_EVENT) {
      const composed = composeShinePost(event, translate);
      if (!composed.ok) throw new Error(composed.reason);
      const where = `${locale}: ${composed.text}`;
      // A template that lost a value, or kept a separator the dropped clause
      // was hanging from, shows up as one of these.
      expect(composed.text, where).not.toMatch(/\u0000/u);
      expect(composed.text, where).not.toMatch(/[{}]/u);
      expect(composed.text, where).not.toMatch(/ {2}/u);
      expect(composed.text, where).not.toMatch(/\s[.,]/u);
      expect(composed.text.trim(), where).toBe(composed.text);
    }
  });

  it("states the figures it was given", () => {
    for (const event of EVERY_EVENT) {
      const composed = composeShinePost(event, translate);
      if (!composed.ok) throw new Error(composed.reason);
      for (const figure of figuresOf(event)) {
        expect(composed.text, `${locale} ${event.id}`).toContain(figure);
      }
    }
  });
});

describe("a catalogue that cannot answer", () => {
  it("refuses rather than publishing a key path", () => {
    const composed = composeShinePost(
      { service: "memecoin", id: "s1", kind: "buy", symbol: "PEPE", price: null },
      (key) => `shine.post.${key}`
    );
    expect(composed.ok).toBe(false);
    if (!composed.ok) expect(composed.reason).toContain("missing from this locale's catalogue");
  });

  it("refuses a translation that dropped the value it was given", () => {
    const composed = composeShinePost(
      { service: "spot", id: "r1", kind: "buy", symbol: "SOL", price: null },
      () => "Bought something on spot."
    );
    expect(composed.ok).toBe(false);
    if (!composed.ok) expect(composed.reason).toContain("{symbol}");
  });

  it("refuses a translation that states a figure twice", () => {
    const composed = composeShinePost(
      {
        service: "spot",
        id: "r1",
        kind: "buy",
        symbol: "SOL",
        price: price("214.30"),
      },
      (_key, values) => `Bought ${values?.symbol} at ${values?.price}, yes ${values?.price}.`
    );
    expect(composed.ok).toBe(false);
    if (!composed.ok) expect(composed.reason).toContain("repeats");
  });

  it("refuses a translation that writes money into the template", () => {
    const composed = composeShinePost(
      { service: "memecoin", id: "s1", kind: "buy", symbol: "PEPE", price: null },
      (_key, values) => `Put $500.00 into ${values?.symbol}.`
    );
    expect(composed.ok).toBe(false);
    if (!composed.ok) expect(composed.reason).toContain("$500.00");
  });
});

describe("no dollar figure can reach a post by accident", () => {
  it("refuses a ticker that carries money instead of a symbol", () => {
    for (const symbol of ["$5,000", "1000 USDC", "5 SOL", "PEPE $4", ""]) {
      const composed = composeShinePost(
        {
          service: "memecoin",
          id: "s9",
          kind: "buy",
          symbol,
          price: price("1"),
        },
        t
      );
      expect(composed.ok, `symbol ${JSON.stringify(symbol)} should be refused`).toBe(false);
    }
  });

  it("refuses a perps market symbol that is not a symbol", () => {
    const composed = composeShinePost(
      {
        service: "perps",
        id: "p9",
        kind: "open",
        symbol: "size 12,500 USDC",
        side: "long",
        leverage: 3,
        price: price("1"),
      },
      t
    );
    expect(composed.ok).toBe(false);
  });

  it("catches a figure a future edit drops into a skeleton", () => {
    // The guard the composers run on themselves. If someone interpolates an
    // amount into a sentence instead of a name slot, this is what trips.
    expect(looseMoneyIn("Bought PEPE with $500.00.")).toBe("$500.00");
    expect(looseMoneyIn("Sold 12,500 USDC of PEPE.")).toBe("12,500 USDC");
    expect(looseMoneyIn("Aped into $PEPE.")).toBeNull();
  });

  it("lets a third-party market title keep its own numbers", () => {
    // The rule is that the USER's amounts never appear. A public market's
    // title is not the user's money, and refusing it would silence most
    // prediction posts.
    const composed = composeShinePost(
      {
        service: "prediction",
        id: "o9",
        market: "Will ETH trade above $10,000?",
        outcome: "No",
        price: price("0.31"),
      },
      t
    );
    expect(composed.ok).toBe(true);
    if (composed.ok) expect(composed.text).toContain("$10,000");
  });

  it("refuses a name that is only control characters or blank", () => {
    expect(
      composeShinePost(
        {
          service: "prediction",
          id: "o8",
          market: "   ",
          outcome: "Yes",
          price: price("0.5"),
        },
        t
      ).ok
    ).toBe(false);
  });

  it("strips the markers a value travels under, so a name cannot forge one", () => {
    const composed = composeShinePost(
      {
        service: "prediction",
        id: "o7",
        market: "Will \u0000#1\u0000 resolve Yes?",
        outcome: "Yes",
        price: null,
      },
      t
    );
    expect(composed.ok).toBe(true);
    if (composed.ok) expect(composed.text).not.toMatch(/\u0000/u);
  });

  it("collapses and caps an absurd third-party name", () => {
    const composed = composeShinePost(
      {
        service: "sports",
        id: "t9",
        kind: "placed",
        event: `Arsenal\n\nvs\tChelsea ${"x".repeat(400)}`,
        selection: "Arsenal to win",
        odds: null,
      },
      t
    );
    expect(composed.ok).toBe(true);
    if (composed.ok) {
      expect(composed.text).not.toContain("\n");
      expect(composed.text.length).toBeLessThan(200);
    }
  });
});
