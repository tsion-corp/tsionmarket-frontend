// Circle CCTP V2 constants, verified against Circle's official docs
// (https://developers.circle.com/cctp). CCTP V2 deploys the SAME contract
// addresses on every supported EVM mainnet, so these are chain-agnostic; the
// domain id selects the chain.
//
// These back the perps funding rail (llms.txt §6a, §6b): the Base -> HyperCore
// top-up and the Arbitrum -> Base last leg of a withdrawal.

import type { Address } from "viem";

// CCTP V2 contracts, identical across every supported EVM mainnet.
export const CCTP_V2 = {
  tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as Address,
  messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as Address,
  tokenMinter: "0xfd78EE919681417d192449715b2594ab58f5D002" as Address,
} as const;

// CCTP domain ids. These are NOT EVM chain ids. HyperEVM (19) is where a
// HyperCore forward lands before the CctpForwarder hook pushes it to HyperCore.
export const CCTP_DOMAIN = {
  ethereum: 0,
  arbitrum: 3,
  base: 6,
  hyperevm: 19,
} as const;

// HyperCore forwarding contracts (HyperEVM mainnet), verified against Circle's
// HyperCore contract-addresses reference. A Base->HyperCore transfer burns to
// HyperEVM with BOTH mintRecipient and destinationCaller set to the forwarder;
// the hook then forwards the mint on to HyperCore automatically.
export const HYPERCORE = {
  cctpForwarder: "0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757" as Address,
  coreDepositWallet: "0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24" as Address,
} as const;

// destinationDex in the forward hook: which HyperCore book the USDC lands in.
export const HYPERCORE_DEX = {
  perps: 0,
  spot: 0xffffffff,
} as const;

// minFinalityThreshold selects the transfer speed:
//   1000 = Fast Transfer (soft finality, seconds, small fee)
//   2000 = Standard      (hard finality, ~13-19 min, free)
export const CCTP_FINALITY = {
  fast: 1000,
  standard: 2000,
} as const;

// USDC token addresses. Same values the Dextopus path already uses.
export const USDC = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
} as const;

// EVM chain ids, for the wallet's chainId when it signs each leg.
export const CHAIN_ID = {
  base: 8453,
  arbitrum: 42161,
} as const;

// Circle's attestation service (Iris), mainnet base URL.
export const CCTP_IRIS_BASE = "https://iris-api.circle.com";
