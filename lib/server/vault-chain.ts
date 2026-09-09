import "server-only";
import { createPublicClient, custom } from "viem";
import { base } from "viem/chains";
import { forwardEvmRpcRead } from "@/lib/server/evm-rpc";
import { cached } from "@/lib/server/response-cache";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";
import { VAULT_CHAIN_ID } from "@/lib/vault/contract";
import { readActiveGamesWith, type ChainGame } from "@/lib/vault/read";

// The Last Man contract read on the server, once per instance per window,
// instead of once per browser every eight seconds. Reads go through the same
// provider pool the RPC route uses, without the route.

const CHAIN_GAMES_TTL_MS = 10_000;

// A viem client for Base that reads through the pooled proxy, without the
// HTTP hop: this already runs on the server.
export function baseReadClient() {
  const chain = getSponsoredEvmChainByNetwork("base-mainnet");
  if (!chain || chain.chainId !== VAULT_CHAIN_ID) throw new Error("Base is not configured");
  let id = 0;
  return createPublicClient({
    chain: base,
    transport: custom({
      async request({ method, params }) {
        const { payload } = await forwardEvmRpcRead(chain, {
          jsonrpc: "2.0",
          id: ++id,
          method,
          params,
        });
        const envelope = (Array.isArray(payload) ? payload[0] : payload) as {
          result?: unknown;
          error?: { message?: string };
        };
        if (envelope?.error) throw new Error(envelope.error.message ?? "rpc error");
        return envelope?.result;
      },
    }),
  });
}

// The wire form: wei as decimal strings, the shape the socket hub and the
// client's own parser already agree on.
export interface ChainGameWire {
  gameId: number;
  starter: string;
  king: string;
  potWei: string;
  minWagerWei: string;
  endTime: number;
}

function toWire(game: ChainGame): ChainGameWire {
  return { ...game, potWei: game.potWei.toString(), minWagerWei: game.minWagerWei.toString() };
}

export async function readChainGames(): Promise<ChainGameWire[]> {
  return cached(
    "vault:chain-games",
    async () => (await readActiveGamesWith(baseReadClient())).map(toWire),
    CHAIN_GAMES_TTL_MS
  );
}
