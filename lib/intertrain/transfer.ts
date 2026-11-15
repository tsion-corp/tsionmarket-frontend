import { ed25519 } from "@noble/curves/ed25519";
import { bech32m } from "@scure/base";
import { normalizeIntertrainAddress } from "@/lib/wallet-core/intertrain";
import { intertrainRpc } from "./rpc";

/**
 * Sending native Kash (WSK) on Intertrain: a signed transfer the node accepts.
 *
 * The signing bytes are Intertrain's own transfer encoding, checked byte for byte against its
 * reference wallet. The account's key signs here, in the browser; the node only ever sees the
 * signed transfer.
 */

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
function varint(value: bigint | number): Uint8Array {
  let current = BigInt(value);
  if (current < 0n) throw new Error("Transfer fields cannot be negative.");
  const bytes: number[] = [];
  do {
    const low = Number(current & 0x7fn);
    current >>= 7n;
    bytes.push(current === 0n ? low : low | 0x80);
  } while (current !== 0n);
  return Uint8Array.from(bytes);
}
const text = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  return concat(varint(bytes.length), bytes);
};
function addressBytes(address: string): Uint8Array {
  const { prefix, bytes } = bech32m.decodeToBytes(address.trim().toLowerCase());
  if ((prefix !== "wsk" && prefix !== "mna") || bytes.length !== 21 || bytes[0] !== 1) {
    throw new Error("Invalid Intertrain address in transaction.");
  }
  return bytes;
}

export interface TransferFields {
  chainId: string;
  from: string;
  to: string;
  nonce: number;
  amount: bigint;
  fee: bigint;
  publicKey: Uint8Array;
  memo: string;
}

export function transferSigningBytes(f: TransferFields): Uint8Array {
  if (!Number.isSafeInteger(f.nonce) || f.nonce < 0) throw new Error("Invalid Intertrain nonce.");
  if (f.publicKey.length !== 32) throw new Error("Intertrain public keys must be 32 bytes.");
  return concat(
    Uint8Array.of(1),
    text(f.chainId),
    varint(f.nonce),
    addressBytes(f.from),
    addressBytes(f.to),
    varint(f.amount),
    varint(f.fee),
    f.publicKey,
    text(f.memo)
  );
}

export interface TransferAccount {
  address: string;
  publicKey: Uint8Array;
  /** The 32-byte ed25519 seed. */
  seed: Uint8Array;
}

/** What it costs to send, in base units (6 decimals). The node's minimum, or 1 where it states none. */
export async function transferFee(): Promise<bigint> {
  const info = await intertrainRpc<{ fee_minimum?: unknown }>("chain_info", {});
  const fee = info.fee_minimum;
  return typeof fee === "string" && /^\d+$/.test(fee)
    ? BigInt(fee)
    : typeof fee === "number"
      ? BigInt(fee)
      : 1n;
}

/** Signs and broadcasts a transfer of `amount` (base units) to `to`. Resolves to its hash. */
export async function sendKash(input: {
  account: TransferAccount;
  to: string;
  amount: bigint;
  memo?: string;
}): Promise<{ hash: string }> {
  const { account, amount } = input;
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  const to = normalizeIntertrainAddress(input.to);
  if (to === normalizeIntertrainAddress(account.address))
    throw new Error("You can't send Kash to yourself.");

  const [chain, state, fee] = await Promise.all([
    intertrainRpc<{ chain_id?: unknown }>("chain_info", {}),
    intertrainRpc<{ balance?: unknown; nonce?: unknown }>("account_get", {
      address: account.address,
    }),
    transferFee(),
  ]);
  if (typeof chain.chain_id !== "string")
    throw new Error("The Intertrain network gave no chain id.");
  const balance = BigInt(String(state.balance ?? "0"));
  const nonce = Number(state.nonce ?? 0);
  if (balance < amount + fee)
    throw new Error("You don't have enough Kash to cover the amount and the network fee.");

  const memo = input.memo ?? "";
  const unsigned = {
    version: 1,
    chain_id: chain.chain_id,
    nonce,
    from: account.address,
    to,
    amount: amount.toString(),
    fee: fee.toString(),
    public_key: hex(account.publicKey),
    memo,
  };
  const signature = hex(
    ed25519.sign(
      transferSigningBytes({
        chainId: chain.chain_id,
        from: account.address,
        to,
        nonce,
        amount,
        fee,
        publicKey: account.publicKey,
        memo,
      }),
      account.seed
    )
  );
  const sent = await intertrainRpc<{ hash?: unknown }>("transaction_broadcast", {
    transaction: { unsigned, signature },
  });
  if (typeof sent.hash !== "string")
    throw new Error("The Intertrain network did not accept the transfer.");
  return { hash: sent.hash };
}

/** Whether the node has the transaction yet. */
export async function transferConfirmed(hash: string): Promise<boolean> {
  try {
    const result = await intertrainRpc<unknown>("transaction_get", { hash });
    return result !== null && result !== undefined;
  } catch {
    return false;
  }
}
