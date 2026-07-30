import { describe, expect, it } from "vitest";
import { isLocale, pickLocale } from "@/lib/i18n";

describe("isLocale", () => {
  it("accepts every supported locale and nothing else", () => {
    for (const l of ["en", "fr", "de", "es", "pt"]) expect(isLocale(l)).toBe(true);
    for (const bad of ["EN", "sw", "zh", "", null, undefined, 3]) expect(isLocale(bad)).toBe(false);
  });
});

describe("pickLocale", () => {
  it("defaults to English with no header", () => {
    expect(pickLocale(null)).toBe("en");
    expect(pickLocale(undefined)).toBe("en");
    expect(pickLocale("")).toBe("en");
  });

  it("matches a plain language tag", () => {
    expect(pickLocale("de")).toBe("de");
    expect(pickLocale("fr")).toBe("fr");
  });

  it("matches on the base subtag of a regional tag", () => {
    expect(pickLocale("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(pickLocale("fr-CH")).toBe("fr");
    expect(pickLocale("pt-BR,pt;q=0.9")).toBe("pt");
  });

  it("honors q-weights over listed order", () => {
    expect(pickLocale("en;q=0.5,fr")).toBe("fr");
    expect(pickLocale("de;q=0.3,es;q=0.9")).toBe("es");
  });

  it("skips unsupported languages and falls through to a supported one", () => {
    expect(pickLocale("sw,pt;q=0.8")).toBe("pt");
    expect(pickLocale("zh-CN,ja;q=0.9")).toBe("en");
  });

  it("tolerates malformed input", () => {
    expect(pickLocale(";;;,,,")).toBe("en");
    expect(pickLocale("fr;q=abc")).toBe("en");
    expect(pickLocale("de;q=0")).toBe("en");
  });
});
