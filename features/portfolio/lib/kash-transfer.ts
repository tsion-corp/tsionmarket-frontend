// Calldata for sending KSH to another wallet. KSH is a plain ERC-20 on Base,
// so a send is a standard transfer() call from the holder's own wallet; the
// engine is not involved. Pure so the encoding is exactly testable.

import { encodeFunctionData } from "viem";
import { kashToWei } from "@/features/portfolio/lib/kash-permit";

const TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isEvmAddress(raw: string): boolean {
  return EVM_ADDRESS.test(raw.trim());
}

/**
 * Calldata for the USDC leg of a KSH purchase.
 *
 * A purchase is settled by the BUYER's own transfer: the engine verifies
 * `from == wallet` on the payment, so it cannot pay on the user's behalf. USDC
 * on Base has 6 decimals, not 18 — using the KSH helper here would overpay by
 * a factor of 10^12.
 */
export function usdcTransferData(to: string, usdcAmount: string): `0x${string}` {
  if (!isEvmAddress(to)) throw new Error(`not an EVM address: ${to}`);
  return encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [to.trim() as `0x${string}`, usdcToAtomic(usdcAmount)],
  });
}

/** USDC is 6-decimal. Parsed from the decimal string, never via a float. */
export function usdcToAtomic(usdcAmount: string): bigint {
  const trimmed = usdcAmount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`not a decimal amount: ${usdcAmount}`);
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > 6) throw new Error(`USDC has at most 6 decimals: ${usdcAmount}`);
  return BigInt(whole + fraction.padEnd(6, "0"));
}

export function kashTransferData(to: string, kashAmount: string): `0x${string}` {
  if (!isEvmAddress(to)) throw new Error(`not an EVM address: ${to}`);
  return encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [to.trim() as `0x${string}`, kashToWei(kashAmount)],
  });
}
