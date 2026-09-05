import { NextResponse, type NextRequest } from "next/server";
import { predictionComboSchemaFor } from "@/lib/api/schemas/prediction-combos";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { verifyRequest } from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";
import {
  predictionCachePolicy,
  readPredictionResponseCache,
  writePredictionResponseCache,
} from "../response-cache";

const LOCAL_PREDICTION_API = "http://127.0.0.1:8086";
const BASE =
  process.env.PREDICTION_COMBOS_API_URL ??
  (process.env.NODE_ENV === "development" ? LOCAL_PREDICTION_API : wsapiService("prediction"));
const ALLOWED_PATHS = new Set([
  "sports/combo-filters",
  "sports/combo-events",
  "sports/filters",
  "sports/events",
  "sports/teams",
  "markets/events",
]);
const WRITE_PATHS = new Set(["combos/quotes", "singles/tickets"]);
const ACCOUNT_HEADERS = [
  "x-polymarket-account-address",
  "x-polymarket-account-api-key",
  "x-polymarket-account-passphrase",
  "x-polymarket-account-timestamp",
  "x-polymarket-account-signature",
] as const;

function cachedResponse(
  cached: NonNullable<ReturnType<typeof readPredictionResponseCache>>,
  state: "fresh" | "stale"
) {
  return NextResponse.json(cached.body, {
    status: cached.status,
    headers: {
      "x-wsws-prediction-cache": state,
      ...(state === "stale" ? { warning: '110 - "Response is stale"' } : {}),
    },
  });
}

function isAllowedPath(path: string): boolean {
  return (
    (ALLOWED_PATHS.has(path) ||
      /^sports\/combo-events\/\d+$/.test(path) ||
      /^sports\/events\/\d+$/.test(path) ||
      /^markets\/events\/\d+$/.test(path)) &&
    !path.includes("..") &&
    !path.includes("%") &&
    !path.includes("\\")
  );
}

function authenticatedHeaders(req: NextRequest): Headers {
  const headers = new Headers({ accept: "application/json" });
  const authorization = req.headers.get("authorization");
  const identityToken = req.headers.get("privy-id-token");
  if (authorization) headers.set("authorization", authorization);
  if (identityToken) headers.set("privy-id-token", identityToken);
  return headers;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const ticketMatch = /^singles\/tickets\/([A-Z0-9]{6})$/iu.exec(joined);
  if (ticketMatch) {
    if (!(await verifyRequest(req))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Sign in to view this ticket." },
        },
        { status: 401 }
      );
    }
    try {
      const ticketPath = `singles/tickets/${ticketMatch[1].toUpperCase()}`;
      const response = await fetch(`${BASE}/${ticketPath}`, {
        cache: "no-store",
        headers: authenticatedHeaders(req),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) : null;
      const contract = checkUpstream(predictionComboSchemaFor(ticketPath), payload, {
        service: "prediction-combos",
        path: ticketPath,
      });
      if (!contract.ok) {
        console.error(contract.problem);
        return NextResponse.json(
          {
            success: false,
            error: { code: "UPSTREAM_CONTRACT", message: "Ark returned an invalid ticket." },
          },
          { status: 502 }
        );
      }
      return new NextResponse(text, {
        status: response.status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch (error) {
      console.error("Prediction ticket proxy failed:", error);
      return NextResponse.json(
        {
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Ark tickets are unreachable right now." },
        },
        { status: 502 }
      );
    }
  }
  if (!isAllowedPath(joined)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const query = req.nextUrl.searchParams.toString();
  const url = `${BASE}/${joined}${query ? `?${query}` : ""}`;
  const cachePolicy = predictionCachePolicy(joined);
  const fresh = readPredictionResponseCache(url, cachePolicy.freshMs);
  if (fresh) return cachedResponse(fresh, "fresh");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (body == null) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UPSTREAM_CONTRACT",
            message: "Prediction markets returned an invalid response.",
          },
        },
        { status: 502 }
      );
    }
    const contract = checkUpstream(predictionComboSchemaFor(joined), body, {
      service: "prediction-combos",
      path: joined,
    });
    if (!contract.ok) {
      console.error(contract.problem);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UPSTREAM_CONTRACT",
            message: "Prediction markets returned an invalid response.",
          },
        },
        { status: 502 }
      );
    }

    if (response.ok) {
      writePredictionResponseCache(url, body, response.status);
    } else if (response.status >= 500) {
      const stale = readPredictionResponseCache(url, cachePolicy.staleMs);
      if (stale) return cachedResponse(stale, "stale");
    }

    return NextResponse.json(body, {
      status: response.status,
      headers: { "x-wsws-prediction-cache": "miss" },
    });
  } catch (error) {
    console.error("Prediction Combo proxy failed:", joined, error);
    const stale = readPredictionResponseCache(url, cachePolicy.staleMs);
    if (stale) return cachedResponse(stale, "stale");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Prediction markets are unreachable right now.",
        },
      },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!WRITE_PATHS.has(joined)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await verifyRequest(req))) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Sign in to continue." },
      },
      { status: 401 }
    );
  }

  const body = await req.text();
  const headers = authenticatedHeaders(req);
  headers.set("content-type", "application/json");
  const idempotency = req.headers.get("idempotency-key") ?? req.headers.get("x-idem-key");
  if (idempotency) headers.set("idempotency-key", idempotency);
  for (const name of ACCOUNT_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const response = await fetch(`${BASE}/${joined}`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : null;
    const contract = checkUpstream(predictionComboSchemaFor(joined), payload, {
      service: "prediction-combos",
      path: joined,
    });
    if (!contract.ok) {
      console.error(contract.problem);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UPSTREAM_CONTRACT",
            message: "Prediction markets returned an invalid response.",
          },
        },
        { status: 502 }
      );
    }
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Prediction write proxy failed:", joined, error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Prediction markets are unreachable right now.",
        },
      },
      { status: 502 }
    );
  }
}
