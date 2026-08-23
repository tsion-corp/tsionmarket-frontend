import { isIP } from "node:net";

const IPINFO_BASE_URL = "https://api.ipinfo.io/lite";
const COUNTRY_CODE = /^[A-Z]{2}$/u;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const countryCache = new Map<string, { code: string; expiresAt: number }>();

interface IpinfoLiteResponse {
  country_code?: unknown;
}

function normalizedCountryCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return COUNTRY_CODE.test(code) && code !== "XX" ? code : null;
}

function normalizedIp(value: string): string | null {
  let candidate = value.trim().replace(/^"|"$/gu, "");
  if (candidate.startsWith("[")) {
    const close = candidate.indexOf("]");
    if (close > 0) candidate = candidate.slice(1, close);
  }
  if (candidate.startsWith("::ffff:")) candidate = candidate.slice(7);
  if (isIP(candidate)) return candidate;

  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/u)?.[1];
  return ipv4WithPort && isIP(ipv4WithPort) === 4 ? ipv4WithPort : null;
}

function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [first, second] = ip.split(".").map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  const lower = ip.toLowerCase();
  return !(
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    /^fe[89ab]/u.test(lower)
  );
}

function clientPublicIp(headers: Headers): string | null {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-forwarded-for"),
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
  ];

  for (const header of candidates) {
    for (const value of header?.split(",") ?? []) {
      const ip = normalizedIp(value);
      if (ip && isPublicIp(ip)) return ip;
    }
  }
  return null;
}

function cachedCountry(key: string): string | null {
  const cached = countryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    countryCache.delete(key);
    return null;
  }
  return cached.code;
}

export async function detectRequestCountry(headers: Headers): Promise<string | null> {
  const edgeCountry = normalizedCountryCode(
    headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry")
  );
  if (edgeCountry) return edgeCountry;

  const token = process.env.IPINFO_TOKEN?.trim();
  if (!token) return null;

  const publicIp = clientPublicIp(headers);
  const target = publicIp ?? (process.env.NODE_ENV === "development" ? "me" : null);
  if (!target) return null;

  const cached = cachedCountry(target);
  if (cached) return cached;

  try {
    const response = await fetch(`${IPINFO_BASE_URL}/${encodeURIComponent(target)}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      console.warn("IPinfo country lookup failed.", { status: response.status });
      return null;
    }
    const payload = (await response.json()) as IpinfoLiteResponse;
    const country = normalizedCountryCode(
      typeof payload.country_code === "string" ? payload.country_code : null
    );
    if (country) {
      countryCache.set(target, { code: country, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return country;
  } catch (error) {
    console.warn("IPinfo country lookup failed.", {
      cause: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}
