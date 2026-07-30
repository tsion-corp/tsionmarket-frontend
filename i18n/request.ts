import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, pickLocale } from "@/lib/i18n";

// Resolves the request's locale without locale URLs: the switcher's cookie
// wins; a first visit falls back to Accept-Language negotiation so a German or
// French browser lands in its own language before touching anything.
export default getRequestConfig(async () => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : pickLocale((await headers()).get("accept-language"));

  try {
    return { locale, messages: (await import(`../messages/${locale}.json`)).default };
  } catch {
    // A missing catalog must never take the app down; English always exists.
    return {
      locale: DEFAULT_LOCALE,
      messages: (await import(`../messages/en.json`)).default,
    };
  }
});
