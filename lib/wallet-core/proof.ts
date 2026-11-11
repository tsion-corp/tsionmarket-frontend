import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertId, type ChainFamily } from "./aad";
import type { KeyMaterial } from "./derive";
import { fromBase64Url, toBase64Url, utf8 } from "./encoding";

/**
 * Proof that the person controls the key behind an address.
 *
 * At wallet creation the server hands out a one-time nonce and the device signs
 * a fixed message containing it, per account, with that account's own key.
 * Without this, anyone could register an address they merely know, which would
 * let them be attributed that address's deposits or payouts.
 *
 * The message is domain-separated and names the wallet, the account and the
 * nonce, so a signature cannot be replayed for another account, wallet or
 * session, or be mistaken for a signature over anything else.
 */

const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

export function possessionMessage(walletId: string, accountId: string, nonce: string): string {
  assertId(walletId, "wallet id");
  assertId(accountId, "account id");
  if (!NONCE.test(nonce)) throw new Error("Invalid nonce");
  return `tsion-wallet-possession:v1:${walletId}:${accountId}:${nonce}`;
}

export async function signPossession(
  material: KeyMaterial,
  walletId: string,
  accountId: string,
  nonce: string
): Promise<string> {
  const message = possessionMessage(walletId, accountId, nonce);
  if (material.family === "evm") {
    return privateKeyToAccount(material.privateKey).signMessage({ message });
  }
  return toBase64Url(ed25519.sign(utf8(message), material.seed));
}

export async function verifyPossession(input: {
  family: ChainFamily;
  address: string;
  walletId: string;
  accountId: string;
  nonce: string;
  signature: string;
}): Promise<boolean> {
  try {
    const message = possessionMessage(input.walletId, input.accountId, input.nonce);
    if (input.family === "evm") {
      return await verifyMessage({
        address: input.address as `0x${string}`,
        message,
        signature: input.signature as `0x${string}`,
      });
    }
    return ed25519.verify(
      fromBase64Url(input.signature),
      utf8(message),
      base58.decode(input.address)
    );
  } catch {
    return false;
  }
}
