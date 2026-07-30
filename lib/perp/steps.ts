// Pure conversion from the gateway's unsigned transaction steps into the calls
// the wallet signs. This is the last gate before signing, so a malformed step
// (wrong chain, garbage value, suspicious target) throws here instead of
// reaching the wallet — signing is headless on Base, so nothing downstream
// gives the user a checkpoint.

import { PERP_CHAIN_ID, USDC_ADDRESS, parseStepValueWei } from "@/lib/perp/logic";
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
      if (
        step.data?.toLowerCase().startsWith(APPROVE_SELECTOR) &&
        step.to.toLowerCase() !== USDC_ADDRESS.toLowerCase()
      ) {
        throw new Error("Transaction step approves an unexpected token.");
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
