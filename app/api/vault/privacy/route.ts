import { NextResponse, type NextRequest } from "next/server";
import { readEvm } from "@/lib/server/evm-read";
import { VAULT_CHAIN_ID, vaultContractAddress } from "@/lib/vault/contract";

// Whether a game is private, read from the contract rather than the lobby
// socket. The keeper caches its ABI choice for the life of its process
// (ethers-chain-client-v5.ts, `privacyFieldSupported ??=`), so one started
// before the v5.1 upgrade reports every game public. The contract cannot be
// stale, and the RPC token is server-only, so the read happens here.
//
// games(uint256) returns eleven words on v5.1; isPrivate is the last.
const GAMES_SELECTOR = "0x117a5b90";
const WORDS_IN_V51_TUPLE = 11;

// One lobby's worth; an unbounded list would hammer the RPC provider.
const MAX_IDS = 50;

function parseIds(raw: string | null): number[] | null {
  if (!raw) return null;
  const parts = raw.split(",").filter((part) => part !== "");
  if (parts.length === 0 || parts.length > MAX_IDS) return null;
  const ids: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const id = Number(part);
    if (!Number.isSafeInteger(id)) return null;
    ids.push(id);
  }
  return ids;
}

function isPrivateFrom(result: unknown): boolean | null {
  if (typeof result !== "string" || !result.startsWith("0x")) return null;
  const body = result.slice(2);
  const words = Math.floor(body.length / 64);
  // A ten-word answer is a v5.0 proxy with no such field. Unknown, not public:
  // guessing public is the direction that exposes a game.
  if (words < WORDS_IN_V51_TUPLE) return null;
  const last = body.slice((WORDS_IN_V51_TUPLE - 1) * 64, WORDS_IN_V51_TUPLE * 64);
  return /^0*1$/.test(last);
}

export async function GET(req: NextRequest) {
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  if (!ids) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Invalid ids" } },
      { status: 400 }
    );
  }

  const vault = vaultContractAddress();
  const calls = ids.map((id, index) => ({
    id: index + 1,
    method: "eth_call",
    params: [
      { to: vault, data: `${GAMES_SELECTOR}${id.toString(16).padStart(64, "0")}` },
      "latest",
    ],
  }));

  let answers;
  try {
    answers = await readEvm("base-mainnet", VAULT_CHAIN_ID, calls);
  } catch (error) {
    // Empty is the safe failure: the caller treats unknown as "keep what you
    // had", never as public.
    console.warn("Vault privacy read failed:", String(error));
    return NextResponse.json({ private: {} }, { headers: { "cache-control": "no-store" } });
  }

  const flags: Record<string, boolean> = {};
  answers.forEach((answer, index) => {
    const id = ids[index];
    if (id === undefined) return;
    const value = isPrivateFrom((answer as { result?: unknown }).result);
    if (value !== null) flags[String(id)] = value;
  });

  return NextResponse.json({ private: flags }, { headers: { "cache-control": "no-store" } });
}
