import { NextResponse, type NextRequest } from "next/server";
import { readEvm } from "@/lib/server/evm-read";
import { VAULT_CHAIN_ID, vaultContractAddress } from "@/lib/vault/contract";

/**
 * Whether a game is still live, read from the contract rather than the
 * service. A wager on the buzzer extends endTime in its own transaction, so
 * the chain knows a round carried on seconds before the indexer does, and
 * that window is exactly when a winner would be named wrongly.
 *
 * Judged against the latest block's timestamp, not the caller's clock.
 *
 * games(uint256) returns eleven static words on v5.1:
 *   0 starter, 1 endTime, 2 settled, 3 king, 4 decimals, 5 token,
 *   6 minWager, 7 pot, 8 winnerBps, 9 starterBps, 10 isPrivate
 */
const GAMES_SELECTOR = "0x117a5b90";
const WORD = 64;

function word(body: string, index: number): string | null {
  const start = index * WORD;
  if (body.length < start + WORD) return null;
  return body.slice(start, start + WORD);
}

function hexToNumber(hex: string): number | null {
  const value = Number.parseInt(hex, 16);
  return Number.isSafeInteger(value) ? value : null;
}

interface ChainGameStatus {
  endTime: number;
  settled: boolean;
  king: string;
}

export function decodeGameStatus(result: unknown): ChainGameStatus | null {
  if (typeof result !== "string" || !result.startsWith("0x")) return null;
  const body = result.slice(2);
  const endTimeWord = word(body, 1);
  const settledWord = word(body, 2);
  const kingWord = word(body, 3);
  if (endTimeWord === null || settledWord === null || kingWord === null) return null;
  const endTime = hexToNumber(endTimeWord);
  // A game that was never started reads back all zeros.
  if (endTime === null || endTime === 0) return null;
  return {
    endTime,
    settled: /^0*1$/.test(settledWord),
    king: `0x${kingWord.slice(24)}`,
  };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("id");
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Invalid id" } },
      { status: 400 }
    );
  }
  const id = Number(raw);

  let answers;
  try {
    answers = await readEvm("base-mainnet", VAULT_CHAIN_ID, [
      {
        id: 1,
        method: "eth_call",
        params: [
          {
            to: vaultContractAddress(),
            data: `${GAMES_SELECTOR}${id.toString(16).padStart(WORD, "0")}`,
          },
          "latest",
        ],
      },
      { id: 2, method: "eth_getBlockByNumber", params: ["latest", false] },
    ]);
  } catch (error) {
    // The caller falls back to the service's own answer.
    console.warn("Vault status read failed:", String(error));
    return NextResponse.json({ known: false }, { headers: { "cache-control": "no-store" } });
  }

  const status = decodeGameStatus((answers[0] as { result?: unknown } | undefined)?.result);
  const block = (answers[1] as { result?: { timestamp?: unknown } } | undefined)?.result;
  const chainNow =
    typeof block?.timestamp === "string" ? hexToNumber(block.timestamp.replace(/^0x/, "")) : null;
  if (!status || chainNow === null) {
    return NextResponse.json({ known: false }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    {
      known: true,
      endTime: status.endTime,
      settled: status.settled,
      king: status.king,
      chainNow,
      live: !status.settled && status.endTime > chainNow,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
