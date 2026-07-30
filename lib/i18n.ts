// Locale configuration and pure negotiation logic. No framework imports, so
// the Accept-Language matcher is unit tested. The app localizes content
// without locale URLs: the choice lives in a cookie, read server-side by
// i18n/request.ts, so no route ever moves.

export const LOCALES = ["en", "fr", "de", "es", "pt"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// The cookie next-intl conventionally reads; set by the language switcher.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Native-language names, so every user can find their own language in the
// switcher regardless of the currently active one.
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt: "Português",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Picks the best supported locale from an Accept-Language header, so a first
// visit from a German or French browser lands in that language before the user
// touches anything. Honors q-weights, matches on the base language subtag
// ("fr-CH" counts as "fr"), and falls back to English.
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((t) => t.tag.length > 0 && t.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  for (const { tag } of tags) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
