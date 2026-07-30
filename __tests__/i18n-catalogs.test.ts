import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES } from "@/lib/i18n";

// Guards the translation catalogs as a set: every locale must mirror the
// English key structure exactly, carry the same ICU placeholders and rich-text
// tags, and never contain the brand name (it always arrives as a {brand}
// parameter). A drifted catalog fails here instead of falling back at runtime.

type Catalog = Record<string, unknown>;

function load(locale: string): Catalog {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf-8"));
}

function flatten(value: Catalog, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    const path = `${prefix}${key}`;
    if (typeof v === "string") out[path] = v;
    else Object.assign(out, flatten(v as Catalog, `${path}.`));
  }
  return out;
}

const catalogs = Object.fromEntries(LOCALES.map((l) => [l, flatten(load(l))]));
const enKeys = Object.keys(catalogs.en).sort();

describe("translation catalogs", () => {
  it("every locale has exactly the English key set", () => {
    for (const locale of LOCALES) {
      expect(Object.keys(catalogs[locale]).sort(), `locale ${locale}`).toEqual(enKeys);
    }
  });

  it("placeholders and rich-text tags match English in every locale", () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();
    for (const key of enKeys) {
      const refP = placeholders(catalogs.en[key]);
      const refT = tags(catalogs.en[key]);
      for (const locale of LOCALES) {
        expect(placeholders(catalogs[locale][key]), `${locale}:${key} placeholders`).toEqual(refP);
        expect(tags(catalogs[locale][key]), `${locale}:${key} tags`).toEqual(refT);
      }
    }
  });

  it("the brand name never appears inside a catalog string", () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value.includes("TSION"), `${locale}:${key} embeds the brand`).toBe(false);
      }
    }
  });

  it("no catalog string is empty", () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value.trim().length, `${locale}:${key} is empty`).toBeGreaterThan(0);
      }
    }
  });
});
