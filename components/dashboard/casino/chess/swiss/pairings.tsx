"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { isSeated, type SwissPairing, type SwissRound } from "@/lib/casino/api/swiss";

// Chess score notation is universal, so results render as notation rather
// than translated prose; only states without a notation go through i18n.
const RESULT_NOTATION: Partial<Record<SwissPairing["status"], string>> = {
  white: "1-0",
  black: "0-1",
  draw: "½-½",
};

function PairingStatus({ pairing }: { pairing: SwissPairing }) {
  const t = useTranslations("casino.chess.swiss");

  const label =
    pairing.status === "ongoing"
      ? t("pairingOngoing")
      : pairing.status === "bye"
        ? t("bye")
        : (RESULT_NOTATION[pairing.status] ?? "");

  return (
    <span className="tnum inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/70">
      {label}
      {pairing.isForfeit ? <span className="font-normal text-white/50">{t("forfeit")}</span> : null}
    </span>
  );
}

// A pairing links to the shared play screen while its board is live: the seat
// holder plays, anyone else watches. Managed boards cannot be aborted, so
// there is nothing else to offer here.
function PairingAction({ pairing, yourName }: { pairing: SwissPairing; yourName: string | null }) {
  const t = useTranslations("casino.chess.swiss");
  if (!pairing.matchId || pairing.status !== "ongoing") return null;

  return isSeated(pairing, yourName) ? (
    <Link
      href={`/casino/chess/play?match=${pairing.matchId}&player=${encodeURIComponent(yourName ?? "")}`}
      className="bg-up text-up-ink rounded-full px-4 py-1.5 text-center font-sans text-[12px] font-bold"
    >
      {t("play")}
    </Link>
  ) : (
    <Link
      href={`/casino/chess/watch?match=${pairing.matchId}`}
      className="rounded-full border border-white/15 px-4 py-1.5 text-center font-sans text-[12px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white"
    >
      {t("watch")}
    </Link>
  );
}

export function SwissRoundPairings({
  round,
  yourName,
}: {
  round: SwissRound;
  yourName: string | null;
}) {
  const t = useTranslations("casino.chess.swiss");

  return (
    <div className="mb-5">
      <div className="mb-2.5 text-[13px] font-semibold text-white/85">
        {t("roundTitle", { round: round.round })}
      </div>
      <div className="flex flex-col gap-2">
        {round.pairings.map((pairing) => (
          <div
            key={`${pairing.round}-${pairing.board}`}
            className="ws-inset flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] px-4 py-3 text-[13px]"
          >
            <span className="tnum w-14 shrink-0 font-normal text-white/50">
              {t("board", { board: pairing.board })}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{pairing.white}</span>
              <span className="shrink-0 font-normal text-white/50">{t("vs")}</span>
              <span className="truncate">
                {pairing.black ?? <span className="text-white/50">{t("bye")}</span>}
              </span>
            </span>
            <PairingStatus pairing={pairing} />
            <PairingAction pairing={pairing} yourName={yourName} />
          </div>
        ))}
      </div>
    </div>
  );
}
