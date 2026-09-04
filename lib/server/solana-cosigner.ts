import "server-only";

import {
  address,
  compileTransaction,
  createKeyPairFromBytes,
  createSolanaRpc,
  decompileTransactionMessageFetchingLookupTables,
  getAddressFromPublicKey,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  partiallySignTransaction,
  setTransactionMessageFeePayer,
} from "@solana/kit";
import { alchemyUrls } from "@/lib/server/alchemy-keys";
import { heliusSolanaRpcUrls } from "@/lib/server/helius";

// In-house Solana fee sponsorship, following the same contract as the
// platform gas-sponsor service: the transaction is first prepared with the
// sponsor wallet as fee payer (a keyless rewrite), the user signs their slots
// client-side, and only then does the sponsor add its signature and submit
// the fully signed transaction to the RPC. Active whenever SOLANA_PRIVATE_KEY
// is set, replacing the platform service; the key never leaves this server.
//
// The rewrite is a real decompile/recompile, not a byte patch: v0 messages
// index their accounts, so swapping the payer address in place would silently
// re-point every instruction. Lookup tables are fetched when the message uses
// them (Jupiter routes always do).

const PUBLIC_SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const RPC_URLS = () => {
  const configured = process.env.SOLANA_RPC_URL;
  // One entry per configured Alchemy key, so a throttled or rejected key is
  // just another upstream to step past rather than the end of the list.
  return [
    configured,
    ...heliusSolanaRpcUrls(),
    ...alchemyUrls((key) => `https://solana-mainnet.g.alchemy.com/v2/${key}`),
    PUBLIC_SOLANA_RPC,
  ].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);
};
const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const COMPUTE_BUDGET_PROGRAM_ADDRESS = "ComputeBudget111111111111111111111111111111";
const DEFAULT_COMPUTE_UNIT_LIMIT = 1_400_000n;
// Keep sponsored priority spend close to the normal Solana fee instead of
// accepting a provider-built 0.0001 SOL priority fee for every small trade.
const MAX_PRIORITY_FEE_LAMPORTS = 10_000n;

interface ReadonlyBytes {
  readonly length: number;
  readonly [index: number]: number;
}

function readU32Le(data: ReadonlyBytes): bigint {
  return (
    BigInt(data[1]) | (BigInt(data[2]) << 8n) | (BigInt(data[3]) << 16n) | (BigInt(data[4]) << 24n)
  );
}

function readU64Le(data: ReadonlyBytes): bigint {
  let value = 0n;
  for (let index = 8; index >= 1; index -= 1) value = (value << 8n) | BigInt(data[index]);
  return value;
}

function computeUnitPriceData(microLamports: bigint): Uint8Array {
  const data = new Uint8Array(9);
  data[0] = 3;
  let remaining = microLamports;
  for (let index = 1; index <= 8; index += 1) {
    data[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return data;
}

export function localSponsorConfigured(): boolean {
  return (
    typeof process.env.SOLANA_PRIVATE_KEY === "string" && process.env.SOLANA_PRIVATE_KEY !== ""
  );
}

// Accepts the two shapes wallets export: a base58 string (Phantom/Solflare)
// or a JSON byte array (solana-keygen). Both carry the 64-byte secret key.
export function parseSponsorSecret(raw: string): Uint8Array {
  const trimmed = raw.trim();
  const bytes = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed) as number[])
    : getBase58Encoder().encode(trimmed);
  if (bytes.length !== 64) {
    throw new Error(`SOLANA_PRIVATE_KEY must decode to 64 bytes, got ${bytes.length}`);
  }
  return new Uint8Array(bytes);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

export async function localSponsorAddress(): Promise<string> {
  const secret = parseSponsorSecret(process.env.SOLANA_PRIVATE_KEY as string);
  const keyPair = await createKeyPairFromBytes(secret);
  return getAddressFromPublicKey(keyPair.publicKey);
}

export interface PreparedTransaction {
  transaction: string;
  sponsorPublicKey: string;
}

// Rewrites the fee payer to the sponsor without signing anything. The result
// goes back to the client for the user's signature; sponsorship happens after.
// Key-independent, so it works the same whichever sponsor signs later.
export async function rewriteFeePayerWithRpc(
  serializedTransaction: string,
  sponsorAddress: string,
  rpcUrl: string | readonly string[],
  prefundRent = false
): Promise<PreparedTransaction> {
  const wire = getTransactionDecoder().decode(base64ToBytes(serializedTransaction));
  const compiled = getCompiledTransactionMessageDecoder().decode(wire.messageBytes);
  const rpcUrls = typeof rpcUrl === "string" ? [rpcUrl] : rpcUrl;
  let message: Awaited<ReturnType<typeof decompileTransactionMessageFetchingLookupTables>> | null =
    null;
  let lastError: unknown;
  for (const url of rpcUrls) {
    try {
      message = await decompileTransactionMessageFetchingLookupTables(
        compiled,
        createSolanaRpc(url)
      );
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!message) throw lastError ?? new Error("No Solana RPC is configured");
  const sponsored = setTransactionMessageFeePayer(address(sponsorAddress), message);
  const originalFeePayer = compiled.staticAccounts[0];
  let computeUnitLimit: ReadonlyBytes | null = null;
  for (const instruction of sponsored.instructions) {
    if (
      instruction.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS &&
      instruction.data?.length === 5 &&
      instruction.data[0] === 2
    ) {
      computeUnitLimit = instruction.data;
      break;
    }
  }
  const requestedUnits = computeUnitLimit
    ? readU32Le(computeUnitLimit)
    : DEFAULT_COMPUTE_UNIT_LIMIT;
  const maxUnitPrice = (MAX_PRIORITY_FEE_LAMPORTS * 1_000_000n) / requestedUnits;
  // Token-account creation names its rent payer inside the instruction; merely
  // changing the transaction fee payer does not change it. Seat the sponsor in
  // that payer account directly instead of transferring a fixed SOL reserve to
  // the user. The user's other signer roles (token authority/owner) are untouched.
  const prepared = {
    ...sponsored,
    instructions: Array.from(sponsored.instructions, (instruction) => {
      let next = instruction;
      if (
        instruction.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS &&
        instruction.data?.length === 9 &&
        instruction.data[0] === 3
      ) {
        const requestedPrice = readU64Le(instruction.data);
        if (requestedPrice > maxUnitPrice) {
          next = { ...next, data: computeUnitPriceData(maxUnitPrice) };
        }
      }
      if (
        prefundRent &&
        instruction.programAddress === ASSOCIATED_TOKEN_PROGRAM_ADDRESS &&
        instruction.accounts?.[0]?.address === originalFeePayer
      ) {
        next = {
          ...next,
          accounts: [
            { ...instruction.accounts[0], address: address(sponsorAddress) },
            ...instruction.accounts.slice(1),
          ],
        };
      }
      return next;
    }),
  };
  const recompiled = compileTransaction(prepared);
  return {
    transaction: getBase64EncodedWireTransaction(recompiled),
    sponsorPublicKey: sponsorAddress,
  };
}

export async function prepareWithLocalSponsor(
  serializedTransaction: string,
  prefundRent = false
): Promise<PreparedTransaction> {
  return rewriteFeePayerWithRpc(
    serializedTransaction,
    await localSponsorAddress(),
    RPC_URLS(),
    prefundRent
  );
}

export interface CosignSubmitResult {
  transaction: string;
  submittedSignature: string;
  sponsorPublicKey: string;
}

// Adds the sponsor's signature to a user-signed transaction whose fee payer is
// already the sponsor, then submits it. Mirrors the gas-sponsor service's
// contract so the client flow is identical on both paths. Exposed with an
// injectable secret so the transform is unit-testable without the environment.
export async function cosignAndSubmitWithSecret(
  serializedTransaction: string,
  secretKeyBytes: Uint8Array,
  rpcUrl: string | readonly string[]
): Promise<CosignSubmitResult> {
  const keyPair = await createKeyPairFromBytes(secretKeyBytes);
  const sponsorAddress = await getAddressFromPublicKey(keyPair.publicKey);

  const wire = getTransactionDecoder().decode(base64ToBytes(serializedTransaction));
  const compiled = getCompiledTransactionMessageDecoder().decode(wire.messageBytes);
  const feePayer = compiled.staticAccounts[0];
  if (feePayer !== sponsorAddress) {
    throw new Error("Transaction fee payer must be the configured sponsor wallet");
  }

  const signed = await partiallySignTransaction([keyPair], wire);
  const wireTransaction = getBase64EncodedWireTransaction(signed);

  const rpcUrls = typeof rpcUrl === "string" ? [rpcUrl] : rpcUrl;
  let signature: string | null = null;
  let lastError: unknown;
  for (const url of rpcUrls) {
    try {
      signature = await createSolanaRpc(url)
        .sendTransaction(wireTransaction, {
          encoding: "base64",
          preflightCommitment: "confirmed",
          maxRetries: 3n,
        })
        .send();
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!signature) throw lastError ?? new Error("No Solana RPC is configured");

  return {
    transaction: wireTransaction,
    submittedSignature: signature,
    sponsorPublicKey: sponsorAddress,
  };
}

export async function cosignAndSubmitWithLocalSponsor(
  serializedTransaction: string
): Promise<CosignSubmitResult> {
  const secret = parseSponsorSecret(process.env.SOLANA_PRIVATE_KEY as string);
  return cosignAndSubmitWithSecret(serializedTransaction, secret, RPC_URLS());
}
