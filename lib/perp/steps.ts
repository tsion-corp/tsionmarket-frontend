// Pure conversion from the gateway's unsigned transaction steps into the calls
// the wallet signs. This is the last gate before signing, so a malformed step
// (wrong chain, garbage value, suspicious target) throws here instead of
// reaching the wallet — signing is headless on Base, so nothing downstream
// gives the user a checkpoint.

import {
  PERP_CHAIN_ID,
  TRADING_STORAGE_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  parseStepValueWei,
} from "@/lib/perp/logic";
import type { BuildResult } from "@/lib/perp/types";

export interface SignableCall {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

// ERC-20 approve(address,uint256) selector. An approval grants spend rights,
// so an approve-shaped step aimed anywhere but the real USDC contract is the
// classic lookalike-token attack and must never be signed.
const APPROVE_SELECTOR = "0x095ea7b3";

// WETH9 withdraw(uint256) selector — unwraps WETH back to native ETH. The gas
// top-up flow (lib/perp/gas-topup.ts) appends this after buying WETH, so it
// can be signed in the same batch as the perp action it's funding. Allowed
// only against the real WETH contract, same reasoning as the approve check.
const WETH_WITHDRAW_SELECTOR = "0x2e1a7d4d";

// Per-step native value cap: the keeper execution fee is ~0.00035 ETH, so a
// step asking for more than 0.005 ETH is not a perp trade — refuse to attach
// the user's ETH to it.
const MAX_STEP_VALUE_WEI = 5_000_000_000_000_000n;

const HEX_DATA = /^0x[a-fA-F0-9]*$/;

export function toSignableCalls(results: BuildResult[]): SignableCall[] {
  const calls: SignableCall[] = [];
  for (const result of results) {
    if (result.chainId !== PERP_CHAIN_ID) {
      throw new Error("The trade was built for the wrong network.");
    }
    for (const step of result.steps) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(step.to)) {
        throw new Error("Transaction step has an invalid target.");
      }
      if (step.data != null && !HEX_DATA.test(step.data)) {
        throw new Error("Transaction step has invalid calldata.");
      }
      if (step.data?.toLowerCase().startsWith(APPROVE_SELECTOR)) {
        if (step.to.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
          throw new Error("Transaction step approves an unexpected token.");
        }
        // Only the venue's storage contract may receive spend rights.
        const spender = `0x${step.data.slice(34, 74)}`.toLowerCase();
        if (spender !== TRADING_STORAGE_ADDRESS.toLowerCase()) {
          throw new Error("Transaction step approves an unexpected spender.");
        }
      }
      if (
        step.data?.toLowerCase().startsWith(WETH_WITHDRAW_SELECTOR) &&
        step.to.toLowerCase() !== WETH_ADDRESS.toLowerCase()
      ) {
        throw new Error("Transaction step calls withdraw on an unexpected contract.");
      }
      const value = parseStepValueWei(step.value);
      if (value > MAX_STEP_VALUE_WEI) {
        throw new Error("Transaction step attaches an unexpected amount of ETH.");
      }
      calls.push({
        to: step.to as `0x${string}`,
        data: step.data as `0x${string}`,
        value,
      });
    }
  }
  return calls;
}

// Total native value the steps attach (the keeper execution fee), so the UI
// can tell the user they need ETH on Base before signing, not from a revert.
export function stepsTotalValueWei(results: BuildResult[]): bigint {
  let total = 0n;
  for (const r of results) for (const s of r.steps) total += parseStepValueWei(s.value);
  return total;
}
