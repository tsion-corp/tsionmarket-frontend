// Runs the plain wallet sweep against an injected signer, so the same code
// serves the one-click button (React hook) and the venue adapter (plain
// object). Per EVM chain one atomic sponsored batch, all ERC-20 transfers
// plus the full native balance, gas paid by the sponsor; on Solana one
// sponsored transaction per asset. A failure marks its assets and moves on.

import { numberToHex } from "viem";
import { encodeErc20Transfer } from "@/lib/deposit";
import { isSubmittedEvmOperationError } from "@/lib/trade/sponsor";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";
import { nativeSendFeeParams } from "@/lib/trade/native-gas";
import type { EvmBatchCall, LegacySigner, SettleOutcome } from "@/lib/migration/types";
import type { ChainSweep, SweepAsset } from "@/features/migrate/lib/plan";

// Either may be absent: a session can hold an EVM address and no Solana one,
// or the reverse. Each chain below needs only its own, so a missing address
// stops that chain's assets and nothing else.
export interface SweepDestinations {
  evm: string | null;
  solana: string | null;
}

// The bundler accepted the operation but no receipt arrived inside the
// 45s window (lib/trade/sponsor). The transfer has very likely LANDED, so it
// must not be re-sent: the next discovery reads the chain and says whether it
// did. Retryable, because a re-read that still shows the balance will offer
// it again.
const SUBMITTED_NOT_CONFIRMED =
  "Sent, but it hasn't confirmed yet. Give it a minute, then check again.";

const NO_EVM_DESTINATION = "Your new account isn't ready on this network yet.";
const NO_SOLANA_DESTINATION = "Your new account isn't ready on Solana yet.";

const NO_LEGACY_SENDER = "Your old account isn't connected. Sign in again.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Transfer failed";
}

/**
 * A chain with no sponsorship: the old wallet pays its own gas out of the
 * native balance it holds, one plain transaction per asset through Privy's
 * own send. Tokens go first, each confirmed before the next so the native
 * balance below is read after their fees have come out; then the native
 * coin, with the fee cap set explicitly and the value set to balance minus
 * gas times that cap — the one shape the node's balance check accepts for
 * sending everything. Nothing here is atomic and nothing needs to be: each
 * transfer is its own outcome.
 */
async function sweepUserPaid(
  chain: ChainSweep,
  chainId: number,
  from: string,
  destination: string,
  signer: LegacySigner,
  outcomes: Map<string, SettleOutcome>
): Promise<void> {
  try {
    // Privy's own switch first: a send names its chain, but the wallet
    // object is bound to a current one and a mismatch is refused.
    await signer.switchChain(chainId);
  } catch (error) {
    for (const asset of chain.assets) {
      outcomes.set(asset.id, { ok: false, error: errorMessage(error), retryable: true });
    }
    return;
  }
  const client = publicClientForChain(chainId);

  for (const asset of chain.assets) {
    try {
      if (asset.tokenAddress !== null) {
        const hash = await signer.sendTransaction({
          chainId,
          to: asset.tokenAddress,
          data: encodeErc20Transfer(destination, asset.amount),
        });
        await awaitReceipt(client, hash, `Moving ${asset.symbol}`);
        outcomes.set(asset.id, { ok: true, txHashes: [hash] });
        continue;
      }

      // The live balance, not the plan's: the token transfers above just paid
      // their fees out of it.
      const balance = await client.getBalance({ address: from as `0x${string}` });
      const fee = await nativeSendFeeParams(chain.network, { from, to: destination });
      const amount = balance - fee.feeWei;
      if (amount <= 0n) {
        outcomes.set(asset.id, {
          ok: false,
          error: `Not enough ${asset.symbol} left to cover the network fee.`,
          retryable: true,
        });
        continue;
      }
      const hash = await signer.sendTransaction({
        chainId,
        to: destination,
        value: numberToHex(amount),
        gasLimit: numberToHex(fee.gas),
        ...(fee.eip1559
          ? {
              maxFeePerGas: numberToHex(fee.maxFeePerGas),
              maxPriorityFeePerGas: numberToHex(fee.maxPriorityFeePerGas),
            }
          : { gasPrice: numberToHex(fee.maxFeePerGas) }),
      });
      await awaitReceipt(client, hash, `Moving ${asset.symbol}`);
      outcomes.set(asset.id, { ok: true, txHashes: [hash] });
    } catch (error) {
      outcomes.set(asset.id, { ok: false, error: errorMessage(error), retryable: true });
    }
  }
}

// Resolves to one outcome per asset id.
export async function runSweep(
  chains: ChainSweep[],
  destinations: SweepDestinations,
  signer: LegacySigner
): Promise<Map<string, SettleOutcome>> {
  const outcomes = new Map<string, SettleOutcome>();
  for (const chain of chains) {
    if (chain.kind === "evm-user-paid") {
      if (!destinations.evm) {
        for (const a of chain.assets) {
          outcomes.set(a.id, { ok: false, error: NO_EVM_DESTINATION, retryable: true });
        }
        continue;
      }
      const chainId = getSponsoredEvmChainByNetwork(chain.network)?.chainId;
      if (!chainId) {
        for (const a of chain.assets) {
          outcomes.set(a.id, {
            ok: false,
            error: `No chain id for network ${chain.network}`,
            retryable: false,
          });
        }
        continue;
      }
      if (!signer.addresses.evm) {
        for (const a of chain.assets) {
          outcomes.set(a.id, { ok: false, error: NO_LEGACY_SENDER, retryable: true });
        }
        continue;
      }
      await sweepUserPaid(chain, chainId, signer.addresses.evm, destinations.evm, signer, outcomes);
      continue;
    }
    if (chain.kind === "evm-batch") {
      const ids = chain.assets.map((a) => a.id);
      if (!destinations.evm) {
        for (const id of ids) {
          outcomes.set(id, { ok: false, error: NO_EVM_DESTINATION, retryable: true });
        }
        continue;
      }
      // Bound here so the narrowing survives into the closure below.
      const evmDestination = destinations.evm;
      // The planner only emits evm-batch chains for sponsored networks, so
      // the registry lookup is the chain-id source of truth.
      const chainId = getSponsoredEvmChainByNetwork(chain.network)?.chainId;
      if (!chainId) {
        for (const id of ids) {
          outcomes.set(id, {
            ok: false,
            error: `No chain id for network ${chain.network}`,
            retryable: false,
          });
        }
        continue;
      }

      const callFor = (a: SweepAsset): EvmBatchCall =>
        a.tokenAddress === null
          ? { to: evmDestination as `0x${string}`, value: a.amount }
          : {
              to: a.tokenAddress as `0x${string}`,
              data: encodeErc20Transfer(evmDestination, a.amount),
            };

      try {
        const hash = await signer.sendBatch(chain.assets.map(callFor), chainId);
        for (const id of ids) outcomes.set(id, { ok: true, txHashes: [hash] });
      } catch (error) {
        // Submitted, receipt not seen yet. Retrying the same transfers now
        // would send the money TWICE (the first operation is already with the
        // bundler and usually lands), and on a wallet swept to zero the second
        // attempt reverts and reports failure for money that did move. Leave
        // it to the next read of the chain.
        if (isSubmittedEvmOperationError(error)) {
          for (const id of ids) {
            outcomes.set(id, { ok: false, error: SUBMITTED_NOT_CONFIRMED, retryable: true });
          }
          continue;
        }
        // The batch is ATOMIC: one call reverting takes every other transfer
        // down with it. A wallet holding real money beside a dust or hostile
        // token therefore moved nothing at all — the token could be paused,
        // blacklisting, fee-on-transfer, or simply have a balance the
        // portfolio read before it changed, and the user's USDC was hostage
        // to it either way.
        //
        // These transfers are independent of each other; nothing here needs
        // atomicity. So a failed batch is retried one asset at a time, and
        // what can move, moves.
        console.warn(
          `[migrate] batch of ${chain.assets.length} reverted on ${chain.network}; retrying individually`,
          error
        );
        for (const asset of chain.assets) {
          try {
            const hash = await signer.sendBatch([callFor(asset)], chainId);
            outcomes.set(asset.id, { ok: true, txHashes: [hash] });
          } catch (individual) {
            outcomes.set(asset.id, {
              ok: false,
              error: isSubmittedEvmOperationError(individual)
                ? SUBMITTED_NOT_CONFIRMED
                : errorMessage(individual),
              retryable: true,
            });
          }
        }
      }
      continue;
    }
    for (const asset of chain.assets) {
      if (!destinations.solana) {
        outcomes.set(asset.id, { ok: false, error: NO_SOLANA_DESTINATION, retryable: true });
        continue;
      }
      try {
        const signature = await signer.sendToken({
          network: asset.network,
          tokenAddress: asset.tokenAddress,
          decimals: asset.decimals,
          to: destinations.solana,
          amount: asset.amount,
        });
        outcomes.set(asset.id, { ok: true, txHashes: [signature] });
      } catch (error) {
        outcomes.set(asset.id, {
          ok: false,
          error: isSubmittedEvmOperationError(error)
            ? SUBMITTED_NOT_CONFIRMED
            : errorMessage(error),
          retryable: true,
        });
      }
    }
  }
  return outcomes;
}
