"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchChallengeByInvite } from "@/lib/casino/api/chess";
import { useAcceptChallenge } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { amountUsd, potBreakdown, weiToUnits } from "@/lib/casino/money";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

function timeControlLabel(tc: string): string {
  return tc === "3+2" || tc === "5+3" ? `${tc} Blitz` : `${tc} Rapid`;
}

// Landing screen for a challenge link. Rendered without the app shell so the
// invite reads as a focused offer, the way the recipient meets it.
export function InviteSection({ inviteCode }: { inviteCode: string | null }) {
  const router = useRouter();
  const wallet = useCasinoWallet();
  const accept = useAcceptChallenge();

  const {
    data: challenge,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["casino", "chess", "invite", inviteCode ?? "none"],
    queryFn: () => fetchChallengeByInvite(inviteCode as string),
    enabled: !!inviteCode,
  });

  const frame = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <div className="ws-glass w-full max-w-[440px] rounded-[20px] p-9 text-center">{children}</div>
    </div>
  );

  if (!inviteCode) return frame(<CasinoEmpty>This invite link is missing its code.</CasinoEmpty>);
  if (error) return frame(<CasinoError error={error} subject="this challenge" />);
  if (isLoading || !challenge) return frame(<CasinoLoading label="Loading challenge" rows={4} />);

  const stakeUsd = amountUsd(challenge.stake, wallet.unitPriceUsd);
  const { feeWei, payoutWei } = potBreakdown(BigInt(challenge.stake.wei));
  const toUsd = (wei: bigint) => weiToUnits(wei.toString()) * wallet.unitPriceUsd;
  const affordable = wallet.canAfford(challenge.stake.wei);

  const onAccept = async () => {
    if (!wallet.connected) {
      toast.error("Sign in to accept this challenge.");
      return;
    }
    if (!affordable) {
      toast.error("Not enough balance to match this stake.");
      return;
    }
    const id = toast.loading("Matching the stake…");
    try {
      const match = await accept.mutateAsync(challenge.id);
      toast.success("Stake matched. Good luck.", { id });
      router.push(`/casino/chess/play?match=${match.id}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't accept that challenge."), { id });
    }
  };

  return frame(
    <>
      <div className="ws-display mb-5 text-[18px]">World Street · Chess challenge</div>
      <div className="mx-auto mb-3.5 h-14 w-14 rounded-full border border-white/10 bg-white/8" />
      <div className="text-[15px]">{challenge.creator.username}</div>
      <div className="mb-5 text-[12px] font-normal text-white/50">
        Rating {challenge.creator.rating} · {timeControlLabel(challenge.timeControl)}
      </div>
      <div className="ws-display tnum text-grey-100 text-[44px]">{wallet.format(stakeUsd)}</div>
      <div className="mb-5 text-[12px] font-normal text-white/50">stake to match</div>
      <div className="text-up mb-5 flex items-center justify-center gap-2 text-[12px]">
        <span className="bg-up h-[7px] w-[7px] rounded-full" />
        Challenger&apos;s stake is already locked
      </div>
      <div className="ws-inset tnum mb-5 px-4 py-3.5 text-left text-[12.5px]">
        <div className="mb-1.5 flex justify-between">
          <span className="font-normal text-white/50">Your stake</span>
          <span>{wallet.format(stakeUsd)}</span>
        </div>
        <div className="mb-1.5 flex justify-between">
          <span className="font-normal text-white/50">Participation fee (5%)</span>
          <span className="font-normal text-white/50">−{wallet.format(toUsd(feeWei))}</span>
        </div>
        <div className="flex justify-between">
          <span>Potential winnings</span>
          <span className="text-grey-100">{wallet.format(toUsd(payoutWei))}</span>
        </div>
      </div>
      <button
        onClick={() => void onAccept()}
        disabled={accept.isPending || !affordable}
        className="text-ink mb-2.5 block w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[14px] font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {accept.isPending
          ? "Matching stake…"
          : affordable
            ? `Accept & stake ${wallet.format(stakeUsd)}`
            : "Not enough balance"}
      </button>
      <Link
        href="/casino"
        className="block w-full p-1.5 text-[12.5px] font-normal text-white/50 hover:text-white"
      >
        Decline
      </Link>
    </>
  );
}
