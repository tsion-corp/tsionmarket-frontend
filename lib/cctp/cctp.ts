// CCTP V2 calldata encoders: the Base -> HyperCore burn with its forward hook,
// the plain burns between Base and Arbitrum, and the destination-chain mint. Pure functions: they only build calldata, they never
// send. The wallet (or a relayer) submits the returned data. Verified against
// Circle's contract interfaces (https://developers.circle.com/cctp).

import { encodeFunctionData, pad, stringToHex, type Address, type Hex } from "viem";
import {
  CCTP_V2,
  CCTP_DOMAIN,
  CCTP_FINALITY,
  HYPERCORE,
  HYPERCORE_DEX,
  USDC,
} from "@/lib/cctp/config";

// CCTP carries recipients and callers as bytes32; a 20-byte EVM address is
// left-padded to 32 bytes.
export function addressToBytes32(address: Address): Hex {
  return pad(address, { size: 32 });
}

// destinationCaller = 0 means ANY caller may submit receiveMessage on the
// destination chain, so a gasless user can have a relayer mint for them.
const ANY_CALLER = `0x${"0".repeat(64)}` as Hex;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const TOKEN_MESSENGER_ABI = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

export const TOKEN_MESSENGER_HOOK_ABI = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const MESSAGE_TRANSMITTER_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Step 1 (source chain): approve the TokenMessenger to pull `amount` of USDC.
export function encodeApprove(amount: bigint): Hex {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [CCTP_V2.tokenMessenger, amount],
  });
}

export interface DepositForBurnParams {
  amount: bigint;
  destinationDomain: number;
  recipient: Address;
  burnToken: Address;
  // Max fee to pay at mint, in USDC units. Must be >= the minimum Fast Transfer
  // fee for a fast transfer; size it from GET /v2/burn/USDC/fees.
  maxFee: bigint;
  fast?: boolean;
}

// Step 2 (source chain): burn `amount` USDC, to be minted to `recipient` on the
// destination domain. destinationCaller is left open so anyone (e.g. a relayer)
// can complete the mint.
export function encodeDepositForBurn(params: DepositForBurnParams): Hex {
  return encodeFunctionData({
    abi: TOKEN_MESSENGER_ABI,
    functionName: "depositForBurn",
    args: [
      params.amount,
      params.destinationDomain,
      addressToBytes32(params.recipient),
      params.burnToken,
      ANY_CALLER,
      params.maxFee,
      params.fast === false ? CCTP_FINALITY.standard : CCTP_FINALITY.fast,
    ],
  });
}

// The Base -> Arbitrum burn: binds the destination domain and burn token, so
// callers only supply amount, recipient and fee. This is the leg that mirrors
// (and can replace) the Dextopus Base->Arbitrum swap.
export function encodeBaseToArbitrumBurn(
  amount: bigint,
  recipient: Address,
  maxFee: bigint,
  fast = true
): Hex {
  return encodeDepositForBurn({
    amount,
    destinationDomain: CCTP_DOMAIN.arbitrum,
    recipient,
    burnToken: USDC.base,
    maxFee,
    fast,
  });
}

// The Arbitrum -> Base burn: the mirror of the Base -> Arbitrum leg above, used
// to finish a withdrawal over CCTP instead of the slower Dextopus swap. The
// funds are already on the user's own Arbitrum wallet (Hyperliquid's withdraw3
// only ever settles to Arbitrum), so this burns them home to Base.
export function encodeArbitrumToBaseBurn(
  amount: bigint,
  recipient: Address,
  maxFee: bigint,
  fast = true
): Hex {
  return encodeDepositForBurn({
    amount,
    destinationDomain: CCTP_DOMAIN.base,
    recipient,
    burnToken: USDC.arbitrum,
    maxFee,
    fast,
  });
}

// The Circle Forwarding Service hook for a HyperCore deposit. Format (verified
// against Circle's encodeForwardHookData): magic "cctp-forward" right-padded to
// 24 bytes, then version (uint32 = 0), payload length (uint32 = 24), the
// HyperCore recipient (20-byte address), and the destination dex (uint32:
// 0 = perps, 0xffffffff = spot). Circle's Forwarding Service reads this to mint
// on HyperEVM and forward to HyperCore automatically.
export function encodeForwardHookData(
  recipient: Address,
  destinationDex: number = HYPERCORE_DEX.perps
): Hex {
  const magic = stringToHex("cctp-forward").slice(2).padEnd(48, "0"); // 24 bytes
  const version = "00000000"; // uint32 0
  const dataLength = "00000018"; // 24-byte payload
  const address = recipient.slice(2).toLowerCase();
  const dex = (destinationDex >>> 0).toString(16).padStart(8, "0");
  return `0x${magic}${version}${dataLength}${address}${dex}` as Hex;
}

// The Base -> HyperCore burn: one source-chain transaction that lands USDC in a
// HyperCore balance. Burns to HyperEVM (domain 19) with BOTH mintRecipient and
// destinationCaller set to the CctpForwarder (required — anything else strands
// the funds), and carries the forward hook so Circle's Forwarding Service
// completes the HyperEVM mint and the HyperCore deposit with no further action.
// maxFee must cover the CCTP protocol fee AND the Forwarding Service fee.
export function encodeBaseToHyperCoreBurn(
  amount: bigint,
  hyperCoreRecipient: Address,
  maxFee: bigint,
  destinationDex: number = HYPERCORE_DEX.perps,
  fast = true
): Hex {
  return encodeFunctionData({
    abi: TOKEN_MESSENGER_HOOK_ABI,
    functionName: "depositForBurnWithHook",
    args: [
      amount,
      CCTP_DOMAIN.hyperevm,
      addressToBytes32(HYPERCORE.cctpForwarder),
      USDC.base,
      addressToBytes32(HYPERCORE.cctpForwarder),
      maxFee,
      fast ? CCTP_FINALITY.fast : CCTP_FINALITY.standard,
      encodeForwardHookData(hyperCoreRecipient, destinationDex),
    ],
  });
}

// Step 4 (destination chain): mint the burned USDC using Circle's attestation.
// Permissionless, and the funds go to the mintRecipient fixed at burn time, so
// it is safe for a relayer to submit this on a gasless user's behalf.
export function encodeReceiveMessage(message: Hex, attestation: Hex): Hex {
  return encodeFunctionData({
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "receiveMessage",
    args: [message, attestation],
  });
}

export const CCTP_FORWARDER_ABI = [
  {
    type: "function",
    name: "mintAndForward",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// Self-relay for a Base->HyperCore deposit. On HyperEVM, our platform relayer
// calls the CctpForwarder's mintAndForward with Circle's message + attestation:
// it mints the burned USDC to the forwarder and forwards it on to HyperCore in
// one call, paying only raw HyperEVM gas. This replaces Circle's paid Forwarding
// Service, so a deposit costs a few cents of gas (which the platform sponsors)
// instead of the ~$0.24 forward fee. `to` is HYPERCORE.cctpForwarder.
export function encodeMintAndForward(message: Hex, attestation: Hex): Hex {
  return encodeFunctionData({
    abi: CCTP_FORWARDER_ABI,
    functionName: "mintAndForward",
    args: [message, attestation],
  });
}
