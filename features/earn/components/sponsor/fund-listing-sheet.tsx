"use client";

import { useQuery } from "@tanstack/react-query";
import { base } from "viem/chains";
import { ModalShell } from "@/components/ui/modal-shell";
import { AsyncLoading } from "@/components/ui/async-state";
import { useFundListing } from "@/features/earn/hooks/use-earn-sponsor-listings";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { useAuthSession } from "@/hooks/use-auth-session";
import { fetchEscrowQuote } from "@/features/earn/lib/api/sponsor-dashboard";
import { buildDepositCalls } from "@/features/earn/lib/escrow";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

interface FundListingSheetProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  onFunded: () => void;
}

// Moving a listing's reward into escrow.
//
// One tap: the sponsor's own wallet approves and deposits as a single sponsored
// batch on Base, then the resulting transaction is handed to the service, which
// reads it back off chain before it will call the listing funded. This service
// never holds the money and never sees a key.
export function FundListingSheet({ open, onClose, listingId, onFunded }: FundListingSheetProps) {
  const fund = useFundListing();
  const sendBatch = useEvmSendBatch();
  const { evmAddress } = useAuthSession();
  // The embedded wallet this deposit is sent from. Passed on so a first-time
  // funder's account has an address the service can verify the deposit against.
  const walletAddress = evmAddress ?? undefined;

  // Fetched only while the sheet is open, and never cached: the amount and the
  // refund deadline are both derived from now, so a stale quote would be
  // rejected by the contract.
  const quoteQuery = useQuery({
    queryKey: ["earn", "escrow-quote", listingId, walletAddress],
    queryFn: () => fetchEscrowQuote(listingId, walletAddress),
    // Waits for the wallet: without it the quote cannot tell whether this
    // deposit has already been made, and would offer to pay a second time.
    enabled: open && !!walletAddress,
    gcTime: 0,
    staleTime: 0,
  });

  const quote = quoteQuery.data ?? null;
  const busy = fund.isPending;

  async function onDeposit() {
    if (!quote) return;

    const alreadyPaid = quote.depositedOnChain === true;
    const id = toast.loading(alreadyPaid ? "Recording your deposit…" : "Confirm in your wallet…");
    try {
      // A deposit that is already on chain is not paid for twice: the contract
      // refuses a second one, and the service records what it can already see.
      const txId = alreadyPaid
        ? ""
        : // Approve and deposit go together, so an allowance is never left
          // sitting between two transactions.
          await sendBatch(buildDepositCalls(quote), base.id);

      if (!alreadyPaid) toast.loading("Checking the deposit on chain…", { id });
      await fund.mutateAsync({ id: listingId, txId, walletAddress });

      toast.success("Reward is in escrow. You can publish now.", { id });
      onFunded();
      onClose();
    } catch (error) {
      // Covers both halves: a wallet the sponsor dismissed, and a deposit the
      // service would not accept. Both say what actually went wrong.
      toast.error(friendlyError(error, "That deposit didn't go through."), { id });
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5" data-sensitive="balance" data-broadcast-suspend>
        <div>
          <h2 className="ws-display text-[18px] text-white">Fund the reward</h2>
          <p className="mt-1 font-sans text-[12.5px] font-normal text-white/50">
            A listing goes live once its reward is in escrow, so applicants can see the money is
            really there before they start work.
          </p>
        </div>

        {!walletAddress ? (
          <p className="ws-inset rounded-[14px] px-4 py-3 font-sans text-[12.5px] font-normal text-white/60">
            Waiting for your wallet…
          </p>
        ) : quoteQuery.isLoading || quoteQuery.isPending ? (
          <AsyncLoading label="Working out what to deposit" rows={2} />
        ) : quoteQuery.error || !quote ? (
          <p className="ws-inset rounded-[14px] px-4 py-3 font-sans text-[12.5px] font-normal text-white/60">
            {friendlyError(quoteQuery.error, "Couldn't work out what to deposit.")}
          </p>
        ) : quote.alreadyFunded ? (
          <p className="ws-inset rounded-[14px] px-4 py-3 font-sans text-[12.5px] font-normal text-white/60">
            This listing is already funded.
          </p>
        ) : (
          <>
            <div className="ws-inset rounded-[14px] px-4 py-3">
              <div className="font-sans text-[12px] font-normal text-white/45">
                Moving to escrow
              </div>
              <div className="ws-display tnum mt-0.5 text-[18px] text-white">
                {quote.amount.toLocaleString()} {quote.tokenSymbol}
              </div>
              {quote.depositedOnChain ? (
                <div className="text-up mt-1 font-sans text-[11.5px] font-medium">
                  Already deposited. This just records it.
                </div>
              ) : null}
              <div className="mt-1.5 font-sans text-[11.5px] font-normal text-white/35">
                Reclaimable by you after{" "}
                {new Date(quote.refundableAfter * 1000).toLocaleDateString()} if you never announce
                winners.
              </div>
            </div>

            <p className="font-sans text-[11.5px] font-normal text-white/35">
              Sent from your own wallet on Base. Gas is covered, and nothing leaves escrow except to
              the winners you announce or back to you.
            </p>
          </>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="ws-inset flex-1 cursor-pointer rounded-full px-4 py-2.5 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onDeposit()}
            disabled={busy || !quote || quote.alreadyFunded}
            className="bg-accent text-ink flex-1 cursor-pointer rounded-full px-4 py-2.5 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? "Confirming…"
              : quote?.depositedOnChain
                ? "Record deposit and publish"
                : "Deposit and publish"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
