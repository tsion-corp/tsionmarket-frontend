// Turning a confirmed event into the sentence that gets published.
//
// Three rules decide every line here.
//
// A post must state something that STAYS TRUE. There is no deep link and no
// card (ADR-2026-09-24 section 5), so nothing about a post can be enriched or
// corrected after it is written. "Bought PEPE at $0.0000042" reads correctly a
// year later. "PEPE is pumping" is wrong within the hour and there is no
// mechanism to fix it. So a post carries what was done and the entry, and a
// return only where the outcome is already settled: a closed position, a won
// game, a landed ticket. An entry has no outcome yet and claims none.
//
// A post must never carry the user's money. Not an amount, not a position
// size, not a balance. components/share/share-to-square.tsx:32 is where that
// reasoning was first written down, for a sheet the user could read before
// tapping. Shine has no such sheet, so the rule is enforced three ways: the
// event types offer no field to put an amount in, the figures that do appear
// are branded types with no constructor from a plain string, and every
// sentence is checked against `looseMoneyIn` before it leaves this file.
//
// A post is written in the AUTHOR'S OWN LANGUAGE. The sentences live in the
// five catalogues under `shine.post`, not in this file, and arrive through a
// `ShineTranslate` the provider hands to the runtime. That keeps this module
// pure — no React, no next-intl, no request context — so every locale can be
// composed and money-checked in a plain unit test.
//
// HOW A TRANSLATED SENTENCE KEEPS THE MONEY GUARD HONEST
//
// A catalogue string is copy this file did not write, so it is treated as
// copy: each value is handed to the translator as an opaque marker, and the
// rendered sentence is cut back apart on those markers. What comes back is
// the same three kinds of piece the guard has always distinguished — the
// catalogue's own words, the third-party names, and the branded figures — so
// a translation that writes a currency symbol into a template is caught by
// `looseMoneyIn` exactly as an English one would be.

import type { EntryPrice, Odds, PnlPercent } from "@/lib/shine/money";
import type { ShineEvent } from "@/lib/shine/types";

export type ComposedShinePost = { ok: true; text: string } | { ok: false; reason: string };

/**
 * How a composer reaches the author's catalogue.
 *
 * Keys are relative to `shine.post`, and the shape is deliberately the one
 * next-intl's `t` already has, so the provider passes its translator straight
 * through and a test passes `createTranslator`'s. `lib/` never reaches for the
 * translation runtime itself: a composer runs inside a queue, not a render,
 * and a module that needed a React context could not be tested for five
 * locales in one file.
 */
export type ShineTranslate = (key: string, values?: Record<string, string>) => string;

/**
 * A currency-marked figure in text that should not contain one.
 *
 * Deliberately narrow: it wants a currency symbol or a token code beside the
 * number, because a bare number is a leverage multiplier, a score or a year
 * far more often than it is money.
 */
const LOOSE_MONEY =
  /[$€£₦]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:USDC|USDT|USD|NGN|KASH|SOL|ETH|BTC)\b/u;

/** The offending text, or null when there is none. */
export function looseMoneyIn(text: string): string | null {
  return LOOSE_MONEY.exec(text)?.[0] ?? null;
}

// A cashtag as lib/square/cashtags.ts marks one up: a letter then one to nine
// letters or digits. Anything else is not a ticker, and the two things that
// most often are not a ticker are an amount and a pair of words.
const TICKER = /^[A-Za-z][A-Za-z0-9]{1,9}$/;

// A perps market reads "BTC-PERP" rather than a cashtag, so it gets its own
// shape: no spaces and no currency marks, which is what matters here.
const MARKET_SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,23}$/;

const MAX_NAME = 80;

function cashtag(symbol: string): string | null {
  const bare = symbol.trim().replace(/^\$/, "");
  return TICKER.test(bare) ? `$${bare.toUpperCase()}` : null;
}

function marketSymbol(symbol: string): string | null {
  const bare = symbol.trim().toUpperCase();
  return MARKET_SYMBOL.test(bare) ? bare : null;
}

/**
 * A third-party name: a market question, a fixture, a selection, a game.
 *
 * These MAY contain numbers and currency symbols, on purpose. "Will ETH trade
 * above $10,000?" is a public market's own title, not the reader's money, and
 * refusing it would silence most prediction posts. The user's own figures
 * cannot arrive this way because no event type has a field for one.
 *
 * Control characters are removed and whitespace collapsed so a name cannot
 * restructure the sentence around it — which now includes the markers the
 * catalogue's values are carried in, since those are control characters too.
 * The length is capped so one long title cannot push a post past what the
 * square accepts.
 */
function plainName(raw: string): string | null {
  const collapsed = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed === "") return null;
  if (collapsed.length <= MAX_NAME) return collapsed;
  return `${collapsed.slice(0, MAX_NAME - 1).trimEnd()}…`;
}

/** "5x", or null when there is no leverage worth stating. */
function leverageLabel(leverage: number | null): string | null {
  if (leverage === null || !Number.isFinite(leverage) || leverage <= 1) return null;
  const rounded = Math.round(leverage * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}x`;
}

type Piece =
  | { kind: "lit"; value: string }
  | { kind: "name"; value: string }
  | { kind: "figure"; value: string };

const lit = (value: string): Piece => ({ kind: "lit", value });
const name = (value: string): Piece => ({ kind: "name", value });
const figure = (value: EntryPrice | PnlPercent | Odds): Piece => ({ kind: "figure", value });

/** One ICU value, and what kind of piece the thing behind it is. */
type Slot = readonly [slot: string, piece: Piece];

const SLOT = /\u0000(\d+)\u0000/g;

// What a value is replaced by on its way through the translator. Distinct
// from the name placeholder above so the two can never be read for each
// other, and made of control characters `plainName` strips, so no name a
// service sends can forge one.
const MARK = /\u0000#(\d+)\u0000/g;
const mark = (index: number): string => `\u0000#${index}\u0000`;

/**
 * Assemble the pieces, checking the sentence for money before the third-party
 * names go in.
 *
 * Names are held back behind placeholders so the check sees exactly what the
 * catalogue wrote plus the figures this file was given, and nothing else. That
 * is what makes the guard worth having: if a later edit — or a translation —
 * puts an amount into a sentence instead of passing it as a name, the guard is
 * looking straight at it, and no one has to remember this rule at review time.
 */
function assemble(pieces: readonly Piece[]): ComposedShinePost {
  const names: string[] = [];
  const figures: string[] = [];
  let skeleton = "";
  for (const piece of pieces) {
    if (piece.kind === "name") {
      skeleton += `\u0000${names.length}\u0000`;
      names.push(piece.value);
      continue;
    }
    if (piece.kind === "figure") figures.push(piece.value);
    skeleton += piece.value;
  }

  let residue = skeleton;
  for (const value of figures) residue = residue.replace(value, "");
  const loose = looseMoneyIn(residue);
  if (loose !== null) {
    return {
      ok: false,
      reason: `a Shine sentence carried a figure that is not an entry price or a return: ${loose}`,
    };
  }

  return { ok: true, text: skeleton.replace(SLOT, (_, index: string) => names[Number(index)]) };
}

function refuse(what: string, value: string): { ok: false; reason: string } {
  return { ok: false, reason: `${what} is not usable in a post: ${JSON.stringify(value)}` };
}

type Filled = { ok: true; pieces: readonly Piece[] } | { ok: false; reason: string };

function unusable(key: string, why: string): Filled {
  return { ok: false, reason: `the shine.post.${key} message ${why}` };
}

/**
 * Whether what came back is the catalogue's sentence or next-intl's stand-in
 * for one it could not find.
 *
 * A missing or malformed message is not an exception in next-intl: the key
 * path comes back as the text. Posting that would publish "shine.post.spot.buy"
 * to a public feed, so it is refused here instead — loudly, into the failure
 * trace, rather than papered over with an English fallback this module would
 * then have to carry a second copy of the copy to provide.
 */
function isMissing(key: string, rendered: string): boolean {
  return rendered === key || rendered.endsWith(`.${key}`) || rendered.trim() === "";
}

/**
 * Render one catalogue sentence and cut it back into pieces.
 *
 * Every slot must come back exactly once. A template that drops a value would
 * silently publish a post missing its price; one that repeats a value would
 * state a figure twice. Both are refusals, and both are caught the same way in
 * every locale.
 */
function fill(t: ShineTranslate, key: string, slots: readonly Slot[]): Filled {
  const values: Record<string, string> = {};
  slots.forEach(([slot], index) => {
    values[slot] = mark(index);
  });

  const rendered = t(key, slots.length === 0 ? undefined : values);
  if (isMissing(key, rendered)) return unusable(key, "is missing from this locale's catalogue");

  const pieces: Piece[] = [];
  const used = new Set<number>();
  let cursor = 0;
  for (const match of rendered.matchAll(MARK)) {
    const index = Number(match[1]);
    const slot = slots[index];
    if (slot === undefined) return unusable(key, "rendered a value this sentence was not given");
    if (used.has(index)) return unusable(key, `repeats {${slot[0]}}`);
    used.add(index);
    if (match.index > cursor) pieces.push(lit(rendered.slice(cursor, match.index)));
    pieces.push(slot[1]);
    cursor = match.index + match[0].length;
  }

  if (used.size !== slots.length) {
    const missing = slots
      .filter((_, index) => !used.has(index))
      .map(([slot]) => `{${slot}}`)
      .join(", ");
    return unusable(key, `does not carry ${missing}`);
  }

  if (cursor < rendered.length) pieces.push(lit(rendered.slice(cursor)));
  return { ok: true, pieces };
}

/**
 * A settled return, as its own short sentence after the main one.
 *
 * Kept separate rather than doubling every key, so a locale writes the return
 * once and no sentence can end up with a stray full stop or a dangling clause
 * because one of its four variants was edited and the others were not.
 */
function withReturn(t: ShineTranslate, main: Filled, pnl: PnlPercent | null): Filled {
  if (!main.ok || pnl === null) return main;
  const tail = fill(t, "return", [["pnl", figure(pnl)]]);
  if (!tail.ok) return tail;
  return { ok: true, pieces: [...main.pieces, lit(" "), ...tail.pieces] };
}

/** The price clause is a variant of the sentence, so a locale can drop it cleanly. */
function at(price: EntryPrice | null): string {
  return price === null ? "" : "At";
}

function priceSlot(price: EntryPrice | null): readonly Slot[] {
  return price === null ? [] : [["price", figure(price)] as const];
}

/**
 * The sentence for one event, in the author's language.
 *
 * The three spot-shaped services keep a voice each — memecoins, spot and
 * real-world assets carry the same facts and must not read like the same post,
 * because a reader seeing "Bought $OUSG at $109.42" with no context has no idea
 * they are looking at tokenised treasuries. That distinction now lives in the
 * catalogues, one namespace per service, so it survives translation.
 */
function sentenceFor(event: ShineEvent, t: ShineTranslate): Filled {
  switch (event.service) {
    case "memecoin":
    case "spot":
    case "rwa": {
      const tag = cashtag(event.symbol);
      if (tag === null) return refuse("the symbol", event.symbol);
      const slots: readonly Slot[] = [["symbol", name(tag)], ...priceSlot(event.price)];
      const key = `${event.service}.${event.kind}${at(event.price)}`;
      const main = fill(t, key, slots);
      return event.kind === "buy" ? main : withReturn(t, main, event.pnl);
    }

    case "prediction": {
      const market = plainName(event.market);
      const outcome = plainName(event.outcome);
      if (market === null) return refuse("the market question", event.market);
      if (outcome === null) return refuse("the outcome", event.outcome);
      return fill(t, `prediction.took${at(event.price)}`, [
        ["outcome", name(outcome)],
        ["market", name(market)],
        ...priceSlot(event.price),
      ]);
    }

    case "perps": {
      const symbol = marketSymbol(event.symbol);
      if (symbol === null) return refuse("the market symbol", event.symbol);
      // The side is a word, not a name: German capitalises it, Spanish and
      // French translate it. It comes from the catalogue and is checked for
      // money with the rest of the sentence.
      const sideKey = `perps.side.${event.side}`;
      const side = t(sideKey);
      if (isMissing(sideKey, side)) {
        return unusable(sideKey, "is missing from this locale's catalogue");
      }

      if (event.kind === "open") {
        const leverage = leverageLabel(event.leverage);
        const key = `perps.open${leverage === null ? "" : "Leveraged"}${at(event.price)}`;
        return fill(t, key, [
          ["side", lit(side)],
          ...(leverage === null ? [] : [["leverage", lit(leverage)] as const]),
          ["symbol", name(symbol)],
          ...priceSlot(event.price),
        ]);
      }

      return withReturn(
        t,
        fill(t, `perps.close${at(event.price)}`, [
          ["side", lit(side)],
          ["symbol", name(symbol)],
          ...priceSlot(event.price),
        ]),
        event.pnl
      );
    }

    case "arcade": {
      const game = plainName(event.game);
      if (game === null) return refuse("the game", event.game);
      const key = event.outcome === "won" ? "arcade.won" : "arcade.drawn";
      return withReturn(t, fill(t, key, [["game", name(game)]]), event.pnl);
    }

    case "sports": {
      const fixture = plainName(event.event);
      const selection = plainName(event.selection);
      if (fixture === null) return refuse("the fixture", event.event);
      if (selection === null) return refuse("the selection", event.selection);
      if (event.kind === "placed") {
        const key = `sports.placed${event.odds === null ? "" : "AtOdds"}`;
        return fill(t, key, [
          ["selection", name(selection)],
          ["event", name(fixture)],
          ...(event.odds === null ? [] : [["odds", figure(event.odds)] as const]),
        ]);
      }
      return withReturn(
        t,
        fill(t, "sports.won", [
          ["selection", name(selection)],
          ["event", name(fixture)],
        ]),
        event.pnl
      );
    }

    default: {
      const unreached: never = event;
      return { ok: false, reason: `no composer for ${JSON.stringify(unreached)}` };
    }
  }
}

/**
 * The sentence for a confirmed event, or a refusal saying why there is none.
 *
 * A refusal is never a reason to post something else. Nothing is published,
 * and the reason goes into the Shine failure trace.
 */
export function composeShinePost(event: ShineEvent, t: ShineTranslate): ComposedShinePost {
  const filled = sentenceFor(event, t);
  return filled.ok ? assemble(filled.pieces) : filled;
}
