// What a referral code looks like, and how a shared link carries one.
//
// Framework-free and in lib/ rather than in features/referrals, because more
// than one feature needs it: the referral page builds invite links, the casino
// and the markets put a code on what they share, and the middleware reads it
// back. A feature may not import another feature, so the shared shape lives
// below them both.
//
// A wallet has TWO codes that both resolve to it (kash ADR-0015): the opaque
// one it is given on its first authenticated read of /referrals/me, and the
// username it chose, if it ever chose one.

/** The engine's rule: 3 to 20 characters, lower-case, starting with a letter. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * The auto-provisioned code, mirroring kash's `REF_CODE_PATTERN` exactly.
 *
 * It is the RECOGNISER as well as the shape, which is why it admits a leading
 * `0` or `1` that the generator never produces: a username must start with a
 * letter, so anything starting with a digit is not one, and it belongs at the
 * code lookup where it gets an honest 404 rather than being silently dropped.
 *
 * That leading digit is the whole of the collision handling. The two
 * namespaces cannot overlap, so a link carrying either kind resolves to one
 * wallet and never to both.
 */
export const REF_CODE_PATTERN = /^[0-9][a-z0-9]{5,15}$/;

/** True for anything that can be claimed: a chosen username or a given code. */
export function isReferralCode(value: string): boolean {
  return USERNAME_PATTERN.test(value) || REF_CODE_PATTERN.test(value);
}

/** The query a shared link carries its sharer's referral code in. */
export const REF_QUERY = "ref";

/**
 * `url` with the sharer's referral code on it, so any link out of the app can
 * be credited. The middleware reads it back on arrival.
 *
 * Returns the url untouched when there is no code yet, or when it already
 * carries one: a link built from somebody else's share keeps their code, since
 * the referral belongs to whoever brought the visitor first.
 *
 * Pure, and takes the code rather than reading it, so it can be tested without
 * a session and used from a server component.
 */
export function withReferral(url: string, code: string | null | undefined): string {
  if (!code || !isReferralCode(code)) return url;
  // The base only matters for a relative url; the result keeps whichever form
  // it was handed, because callers show these to people and an invite that
  // suddenly reads https://ark.invalid is worse than one that stays relative.
  const parsed = new URL(url, "https://ark.invalid");
  if (parsed.searchParams.has(REF_QUERY)) return url;
  parsed.searchParams.set(REF_QUERY, code);
  return url.startsWith("http")
    ? parsed.toString()
    : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * The address-bar form of a signed-in user's own link: `href` with `ref` set
 * to their code, or null when there is nothing to write (no valid code, or
 * the address already carries it).
 *
 * Unlike `withReferral`, this REPLACES a code already in the address. A share
 * button preserves whoever brought the visitor; the address bar belongs to
 * the person reading it, so once they are signed in it carries their code and
 * whatever they copy from it credits them (ADR-2026-10-01-referral-code-in-
 * address-bar). The sharer was already captured by the cookie on arrival.
 */
export function addressWithReferral(href: string, code: string | null | undefined): string | null {
  if (!code || !isReferralCode(code)) return null;
  const parsed = new URL(href, "https://ark.invalid");
  if (parsed.searchParams.get(REF_QUERY) === code) return null;
  parsed.searchParams.set(REF_QUERY, code);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
