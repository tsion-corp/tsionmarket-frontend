import type { LegacyEvmTransaction } from "@/lib/migration/types";

/**
 * The sweep builds a plain transaction with hex fee fields; Decane's send takes
 * bigint fields and one gas price. The sweep's fee cap becomes that gas price,
 * so the network charges at most the cap the amount was worked out against and
 * "everything minus the fee" lands exactly.
 */
export interface DecaneTransaction {
  chain: string;
  to: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
  gasPrice?: bigint;
}

export function toDecaneTransaction(tx: LegacyEvmTransaction): DecaneTransaction {
  const price = tx.gasPrice ?? tx.maxFeePerGas;
  return {
    chain: `evm:${tx.chainId}`,
    to: tx.to,
    ...(tx.value !== undefined ? { value: BigInt(tx.value) } : {}),
    ...(tx.data !== undefined ? { data: tx.data } : {}),
    ...(tx.gasLimit !== undefined ? { gasLimit: BigInt(tx.gasLimit) } : {}),
    ...(price !== undefined ? { gasPrice: BigInt(price) } : {}),
  };
}
