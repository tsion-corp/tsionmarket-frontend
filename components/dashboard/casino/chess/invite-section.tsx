"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { fetchChallengeByInvite } from "@/lib/casino/api/chess";
import { ChessCashierLauncher } from "@/components/dashboard/casino/chess/chess-cashier-launcher";
import { useAcceptChallenge } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/hooks/use-chess-cashier";
import { exceedsUsdcBalance } from "@/lib/casino/api/cashier";
import { WagerSummary } from "@/components/dashboard/casino/chess/wager-summary";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { BRAND } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

// The common chess namespace names the speed after its preset, so the label
// reads "5+3 Blitz" in every locale.
function timeControlLabel(t: ReturnType<typeof useTranslations>, tc: string): string {
  return tc === "3+2" || tc === "5+3" ? t("blitz", { tc }) : t("rapid", { tc });
}

// Landing screen for a challenge link. Rendered without the app shell so the
// invite reads as a focused offer, the way the recipient meets it.
export function InviteSection({ inviteCode }: { inviteCode: string | null }) {
  const t = useTranslations("casino.chess.invite");
  const tCommon = useTranslations("casino.chess.common");
  const tStake = useTranslations("casino.chess.stake");
  const router = useRouter();
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
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

  if (!inviteCode) return frame(<CasinoEmpty>{t("missingCode")}</CasinoEmpty>);
  if (error) return frame(<CasinoError error={error} subject={t("subject")} />);
  if (isLoading || !challenge) return frame(<CasinoLoading label={t("loading")} rows={4} />);

  // A staked challenge locks the same amount from the joiner. Surface it before
  // they take the seat rather than failing them at the server.
  const staked =
    challenge.stakeUsdc && Number(challenge.stakeUsdc) > 0 ? challenge.stakeUsdc : null;
  const insufficient =
    !!staked && cashier.configured && exceedsUsdcBalance(staked, cashier.available);

  const onAccept = async () => {
    if (!wallet.connected) {
      toast.error(t("toastSignIn"));
      return;
    }
    if (insufficient && staked) {
      toast.error(tStake("needsBalance", { amount: staked }));
      return;
    }
    const id = toast.loading(t("takingSeat"));
    try {
      const match = await accept.mutateAsync(challenge.id);
      toast.success(tCommon("youAreIn"), { id });
      router.push(`/casino/chess/play?match=${match.id}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastAcceptFailed")), { id });
    }
  };

  return frame(
    <>
      <div className="ws-display mb-5 text-[18px]">{t("title", { brand: BRAND })}</div>
      <div className="mx-auto mb-3.5 h-14 w-14 rounded-full border border-white/10 bg-white/8" />
      <div className="text-[15px]">{challenge.creator.username}</div>
      <div className="mb-5 text-[12px] font-normal text-white/50">
        {timeControlLabel(tCommon, challenge.timeControl)}
      </div>
      {staked && cashier.configured ? (
        <div className="mb-5 text-left">
          <WagerSummary
            stakeUsdc={staked}
            availableUsdc={cashier.available}
            feeBps={cashier.config?.platformFeeBps ?? 500}
          />
          <div className="mt-2 text-center text-[11.5px] font-normal text-white/50">
            {insufficient
              ? tStake("needsBalance", { amount: staked })
              : tStake("joinLocks", { amount: staked })}
          </div>
        </div>
      ) : (
        <div className="mb-6 text-[12.5px] font-normal text-white/55">{t("waitingNote")}</div>
      )}
      <ChessCashierLauncher compact className="mb-5 text-left" />
      <button
        onClick={() => void onAccept()}
        disabled={accept.isPending || insufficient}
        className="text-ink mb-2.5 block w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[14px] font-medium transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {accept.isPending ? t("takingSeat") : t("accept")}
      </button>
      <Link
        href="/casino"
        className="block w-full p-1.5 text-[12.5px] font-normal text-white/50 hover:text-white"
      >
        {t("decline")}
      </Link>
    </>
  );
}
