import { base } from "viem/chains";

// The Last Standing vault contract lives on Base only.
export const VAULT_CHAIN_ID = base.id;

// Public by design: a contract address identifies the game, it does not
// protect anything, and the browser needs it to build every wager.
export function vaultContractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  if (!address) throw new Error("Vault isn't configured yet");
  return address as `0x${string}`;
}
