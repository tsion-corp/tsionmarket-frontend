import type { Address, Hex } from "viem";
import type { EvmBatchCall } from "@/hooks/use-evm-send";
import { waitForAttestation, type AttestationLookup } from "@/lib/cctp/attestation";
import {
  encodeApprove,
  encodeArbitrumToBaseBurn,
  encodeBaseToHyperCoreBurn,
  encodeReceiveMessage,
} from "@/lib/cctp/cctp";
import {
  CCTP_DOMAIN,
  CCTP_FINALITY,
  CCTP_V2,
  CHAIN_ID,
  HYPERCORE_DEX,
  USDC,
} from "@/lib/cctp/config";
import { maxFeeFromQuote, type CctpFeeQuote } from "@/lib/cctp/fees";

// The two Circle CCTP transfers behind perps funding, as plain async functions
// over injected dependencies so each is testable at the calldata it signs. The
// actions hook supplies the sponsored wallet batch and the app's /api/cctp
// client; nothing here reaches the network on its own.

export interface CctpTransferDeps {
  /** One sponsored, silently signed batch on `chainId`; resolves its tx hash. */
  sendBatch: (calls: EvmBatchCall[], chainId: number) => Promise<Hex>;
  /** Circle's live fee quote for a burn from `source` to `destination`. */
  feeQuote: (
    source: number,
    destination: number,
    flags: { forward: boolean; hyperCoreDeposit: boolean }
  ) => Promise<CctpFeeQuote>;
  lookupAttestation: AttestationLookup;
}

/** Circle's fee could not be read or does not price this burn; nothing was burned. */
export class CctpFeeUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("The transfer fee is unavailable right now.", { cause });
    this.name = "CctpFeeUnavailableError";
  }
}

async function maxFeeFor(
  deps: CctpTransferDeps,
  route: { source: number; destination: number; forward: boolean },
  amount: bigint
): Promise<bigint> {
  let quote: CctpFeeQuote;
  try {
    quote = await deps.feeQuote(route.source, route.destination, {
      forward: route.forward,
      hyperCoreDeposit: route.forward,
    });
  } catch (error) {
    throw new CctpFeeUnavailableError(error);
  }
  const maxFee = maxFeeFromQuote({
    amount,
    quote,
    finality: CCTP_FINALITY.fast,
    includeForwardFee: route.forward,
  });
  if (maxFee === null) throw new CctpFeeUnavailableError();
  return maxFee;
}

/**
 * Top up (llms.txt §6a): approve and burn Base USDC in one sponsored batch,
 * to HyperEVM through the CctpForwarder, so the mint lands in `recipient`'s
 * HyperCore perps balance. When the user pays for the forward, Circle's
 * Forwarding Service relays the mint and maxFee covers its fee; otherwise the
 * platform relays it and maxFee covers the protocol fee alone. Resolves the
 * burn's transaction hash, which the backend tracks the deposit by.
 */
export async function burnBaseUsdcToPerps(
  deps: CctpTransferDeps,
  {
    amount,
    recipient,
    userPaysForward,
  }: { amount: bigint; recipient: Address; userPaysForward: boolean }
): Promise<Hex> {
  const maxFee = await maxFeeFor(
    deps,
    { source: CCTP_DOMAIN.base, destination: CCTP_DOMAIN.hyperevm, forward: userPaysForward },
    amount
  );
  return deps.sendBatch(
    [
      { to: USDC.base, data: encodeApprove(amount) },
      {
        to: CCTP_V2.tokenMessenger,
        data: encodeBaseToHyperCoreBurn(amount, recipient, maxFee, HYPERCORE_DEX.perps),
      },
    ],
    CHAIN_ID.base
  );
}

export type ArbitrumToBaseStep = "moving" | "confirming" | "finishing";

/**
 * The last leg of a withdrawal (llms.txt §6b): the venue settles to the user's
 * own Arbitrum wallet, so this burns that USDC home to Base and mints it there.
 * Both chains are sponsored. The Base mint's receipt is the completion; nothing
 * polls after it. Throws if the attestation never arrives within its window,
 * in which case the burn is on chain and a later resume can finish the mint.
 */
export async function sendArbitrumUsdcToBase(
  deps: CctpTransferDeps,
  {
    amount,
    recipient,
    onStatus,
    attestationTimeoutMs = 120_000,
    attestationIntervalMs = 4_000,
  }: {
    amount: bigint;
    recipient: Address;
    onStatus?: (step: ArbitrumToBaseStep) => void;
    attestationTimeoutMs?: number;
    attestationIntervalMs?: number;
  }
): Promise<void> {
  if (amount <= 0n) return;
  const maxFee = await maxFeeFor(
    deps,
    { source: CCTP_DOMAIN.arbitrum, destination: CCTP_DOMAIN.base, forward: false },
    amount
  );

  onStatus?.("moving");
  const burnTx = await deps.sendBatch(
    [
      { to: USDC.arbitrum, data: encodeApprove(amount) },
      { to: CCTP_V2.tokenMessenger, data: encodeArbitrumToBaseBurn(amount, recipient, maxFee) },
    ],
    CHAIN_ID.arbitrum
  );

  onStatus?.("confirming");
  const { message, attestation } = await waitForAttestation(CCTP_DOMAIN.arbitrum, burnTx, {
    lookup: deps.lookupAttestation,
    timeoutMs: attestationTimeoutMs,
    intervalMs: attestationIntervalMs,
  });

  onStatus?.("finishing");
  await deps.sendBatch(
    [{ to: CCTP_V2.messageTransmitter, data: encodeReceiveMessage(message, attestation) }],
    CHAIN_ID.base
  );
}
