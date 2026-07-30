// Pure conversion from the gateway's unsigned transaction steps into the calls
// the wallet signs. This is the last gate before signing, so a malformed step
// (wrong chain, garbage value) throws here instead of reaching the wallet.

import { PERP_CHAIN_ID, parseStepValueWei } from "@/lib/perp/logic";
import type { BuildResult } from "@/lib/perp/types";

export interface SignableCall {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

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
      calls.push({
        to: step.to as `0x${string}`,
        data: step.data as `0x${string}`,
        value: parseStepValueWei(step.value),
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
