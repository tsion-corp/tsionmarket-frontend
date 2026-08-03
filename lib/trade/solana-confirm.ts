import { signature as toSignature } from "@solana/kit";
import { createAppSolanaRpc } from "@/lib/solana-rpc";

const ATTEMPTS = 20;
const POLL_MS = 1500;

// Waits for a Solana signature to confirm so a balance refetch reflects the
// result instead of the pre-transaction state. Best-effort: returns after
// confirmation, throws on an on-chain failure, or returns after a short timeout.
export async function confirmSolanaSignature(sigBase58: string): Promise<void> {
  const rpc = createAppSolanaRpc();
  const sig = toSignature(sigBase58);
  for (let i = 0; i < ATTEMPTS; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const status = value[0];
    if (status) {
      if (status.err) throw new Error("The transaction failed on-chain.");
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
