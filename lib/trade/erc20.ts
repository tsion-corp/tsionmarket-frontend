// Pure ERC-20 calldata helpers for the EVM swap flow. No framework or wallet
// imports. On-chain amounts stay in integer base units (bigint) so we never
// lose precision to floating point.

// approve(address,uint256) and allowance(address,address) function selectors.
const APPROVE_SELECTOR = "095ea7b3";
const ALLOWANCE_SELECTOR = "dd62ed3e";

// Sentinel LI.FI and most aggregators use for a chain's native asset.
export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function cleanAddress(address: string): string {
  const clean = address.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(clean)) {
    throw new Error("Invalid address");
  }
  return clean;
}

function pad32(hex: string): string {
  return hex.padStart(64, "0");
}

// True when the token is the chain's native asset rather than an ERC-20. Native
// assets do not need an allowance or an approve transaction.
export function isNativeToken(address: string): boolean {
  return address.trim().toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

// Calldata for approve(spender, amount) on an ERC-20 token.
export function encodeApprove(spender: string, amount: bigint): `0x${string}` {
  if (amount < 0n) throw new Error("Amount must not be negative");
  const paddedSpender = pad32(cleanAddress(spender));
  const paddedAmount = pad32(amount.toString(16));
  return `0x${APPROVE_SELECTOR}${paddedSpender}${paddedAmount}`;
}

// Calldata for the allowance(owner, spender) view call on an ERC-20 token.
export function encodeAllowanceCall(owner: string, spender: string): `0x${string}` {
  const paddedOwner = pad32(cleanAddress(owner));
  const paddedSpender = pad32(cleanAddress(spender));
  return `0x${ALLOWANCE_SELECTOR}${paddedOwner}${paddedSpender}`;
}

// Parse the 32-byte word returned by an allowance eth_call into a bigint. An
// empty or "0x" result means no allowance has been set.
export function parseAllowance(result: string): bigint {
  const clean = result.trim();
  if (!clean || clean === "0x") return 0n;
  return BigInt(clean);
}
