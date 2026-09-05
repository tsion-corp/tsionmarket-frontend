import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const PROVIDER_URL = "https://api.onchainfeed.org/api/v1/public/market-manager/sports";
const MAX_IDS = 40;
type GameState = "Prematch" | "Live";

const gameSchema = z.object({
  gameId: z.union([z.string(), z.number()]).transform(String),
  turnover: z.union([z.string(), z.number()]).transform(String),
});

const responseSchema = z.object({
  sports: z.array(
    z.object({
      countries: z.array(
        z.object({
          leagues: z.array(
            z.object({
              games: z.array(gameSchema),
            })
          ),
        })
      ),
    })
  ),
});

function parseIds(value: string | null): string[] | null {
  if (!value) return null;
  const ids = [...new Set(value.split(","))];
  if (ids.length === 0 || ids.length > MAX_IDS || ids.some((id) => !/^\d+$/u.test(id))) {
    return null;
  }
  return ids;
}

async function fetchVolumes(query: URLSearchParams, gameState: GameState) {
  const stateQuery = new URLSearchParams(query);
  stateQuery.set("gameState", gameState);
  const response = await fetch(`${PROVIDER_URL}?${stateQuery}`, {
    headers: { accept: "application/json" },
    next: { revalidate: gameState === "Live" ? 10 : 30 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok)
    throw new Error(`Azuro ${gameState} volume request failed (${response.status})`);
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Azuro ${gameState} volume response was invalid`);
  return parsed.data;
}

export async function GET(req: NextRequest) {
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  const sport = req.nextUrl.searchParams.get("sport") ?? "football";
  const state = req.nextUrl.searchParams.get("state") ?? "prematch";
  if (!ids || !/^[a-z0-9-]{1,40}$/u.test(sport) || !["prematch", "live", "all"].includes(state)) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const query = new URLSearchParams({
    environment: process.env.SPORTSBOOK_VOLUME_ENVIRONMENT ?? "PolygonUSDT",
    sportSlug: sport,
    numberOfGames: "1000",
    orderBy: "turnover",
    orderDirection: "desc",
  });
  const country = req.nextUrl.searchParams.get("country");
  const league = req.nextUrl.searchParams.get("league");
  if (country && /^[a-z0-9-]{1,80}$/u.test(country)) query.set("countrySlug", country);
  if (league && /^[a-z0-9-]{1,80}$/u.test(league)) query.set("leagueSlug", league);

  try {
    const gameStates: GameState[] =
      state === "all" ? ["Prematch", "Live"] : [state === "live" ? "Live" : "Prematch"];
    const pages = await Promise.all(gameStates.map((gameState) => fetchVolumes(query, gameState)));

    const requested = new Set(ids);
    const volumes: Record<string, string> = {};
    for (const page of pages) {
      for (const sportGroup of page.sports) {
        for (const countryGroup of sportGroup.countries) {
          for (const leagueGroup of countryGroup.leagues) {
            for (const game of leagueGroup.games) {
              if (requested.has(game.gameId)) volumes[game.gameId] = game.turnover;
            }
          }
        }
      }
    }
    return NextResponse.json(
      { currency: "USDC", volumes },
      {
        headers: {
          "cache-control": state === "live" ? "public, max-age=10" : "public, max-age=30",
        },
      }
    );
  } catch (error) {
    console.error("Sportsbook reference volume lookup failed:", error);
    return NextResponse.json({ error: "Reference volumes are unavailable" }, { status: 502 });
  }
}
