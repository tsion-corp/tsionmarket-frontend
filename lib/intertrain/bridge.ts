import { sha256 } from "@noble/hashes/sha2";
import { decodeAbiParameters, encodeFunctionData, getAddress, parseAbi, type Hex } from "viem";

/**
 * Arbitrum One USDC -> native WSK (K-ESP), 1 USDC = 1 WSK.
 *
 * The user's own wallet locks USDC in the Arbitrum bridge with depositForWSK(amount, destination).
 * The relayer sees the WSKDeposit event, waits for confirmations and has the Intertrain node mint
 * WSK to `destination`. Nothing here signs or sends: it builds the calls and reads the result.
 *
 * Constants, selectors and the event layout were checked against the live bridge and node.
 */

export const ARBITRUM_CHAIN_ID = 42161;
/** The network key the app's chain registry uses for Arbitrum. */
export const ARBITRUM_NETWORK = "arb-mainnet";
export const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
export const ARBITRUM_WSK_BRIDGE = "0x0729F81ACc0948089B0BAcc0685c461F8F54F23B" as const;
/** keccak256("WSKDeposit(bytes32,address,uint256,string)") */
export const WSK_DEPOSIT_TOPIC =
  "0x8399ea2998de3fe00f8878f42216a68a8956c3687b5d9d0412c4c1a6d3b05ccf";
export const ARBISCAN = "https://arbiscan.io";
export const INTERTRAIN_EXPLORER = "https://explorer.intertrain.online";

export const BRIDGE_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function depositForWSK(uint256 amount, string destination)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function paused() view returns (bool)",
]);

/** "12.5" -> 12500000n. A plain positive amount with up to 6 decimals, nothing else. */
export function parseUsdc(text: string): bigint {
  const s = String(text ?? "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error("Enter an amount with up to 6 decimals.");
  const [whole = "0", fraction = ""] = s.split(".");
  const value = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (value <= 0n) throw new Error("Amount must be greater than zero.");
  return value;
}

/** 12500000n -> "12.5". Six decimals, trailing zeros dropped. */
export function formatUsdc(value: bigint): string {
  const s = value.toString().padStart(7, "0");
  return `${s.slice(0, -6)}.${s.slice(-6)}`.replace(/\.?0+$/, "") || "0";
}
export const formatWsk = formatUsdc;

export interface EvmCall {
  to: `0x${string}`;
  data: Hex;
}

/** Approves exactly `amount` for the bridge, never more. */
export function approveCall(amount: bigint): EvmCall {
  return {
    to: ARBITRUM_USDC,
    data: encodeFunctionData({
      abi: BRIDGE_ABI,
      functionName: "approve",
      args: [ARBITRUM_WSK_BRIDGE, amount],
    }),
  };
}

export function depositCall(amount: bigint, destination: string): EvmCall {
  return {
    to: ARBITRUM_WSK_BRIDGE,
    data: encodeFunctionData({
      abi: BRIDGE_ABI,
      functionName: "depositForWSK",
      args: [amount, destination],
    }),
  };
}

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The relayer's id for a deposit; the node reports its status under it. Matches ops/wsc-relayer.py. */
export function operationIdFor(depositId: string): string {
  return toHex(
    sha256(
      new TextEncoder().encode(
        `intertrain/arbitrum-wsk/v1/${depositId.replace(/^0x/, "").toLowerCase()}`
      )
    )
  );
}

export interface WskDeposit {
  depositId: string;
  sender: `0x${string}`;
  amount: bigint;
  destination: string;
}

interface ReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
}

/**
 * The deposit in a receipt, or null when the bridge emitted none. Only a log from the bridge
 * contract itself counts: an identical event from any other contract proves nothing.
 */
export function findDeposit(logs: readonly ReceiptLog[]): WskDeposit | null {
  const log = logs.find(
    (item) =>
      item.address.toLowerCase() === ARBITRUM_WSK_BRIDGE.toLowerCase() &&
      item.topics[0]?.toLowerCase() === WSK_DEPOSIT_TOPIC &&
      item.topics.length === 3
  );
  const idTopic = log?.topics[1];
  const senderTopic = log?.topics[2];
  if (!log || !idTopic || !senderTopic) return null;
  const [amount, destination] = decodeAbiParameters(
    [{ type: "uint256" }, { type: "string" }],
    log.data as Hex
  );
  return {
    depositId: idTopic.slice(2).toLowerCase(),
    sender: getAddress(`0x${senderTopic.slice(-40)}`),
    amount,
    destination,
  };
}
