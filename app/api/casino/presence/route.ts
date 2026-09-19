import { NextResponse } from "next/server";
import { wsapiService } from "@/lib/wsapi-base";

const LOCAL_GATEWAY = "http://127.0.0.1:8080/v1/casino/presence";
const CACHE_CONTROL = "public, max-age=15, stale-while-revalidate=15";

function upstreamUrl(): string {
  const override = process.env.CASINO_PRESENCE_API_URL?.trim();
  if (override) return override;
  return process.env.NODE_ENV === "development"
    ? LOCAL_GATEWAY
    : `${wsapiService("casino")}/presence`;
}

export async function GET() {
  try {
    const response = await fetch(upstreamUrl(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("Casino presence proxy failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Game presence is unavailable." },
      },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}
