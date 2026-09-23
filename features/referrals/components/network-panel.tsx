"use client";

import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/ui/icons";
import { ReferralCard, ReferralCardTitle } from "@/features/referrals/components/referral-card";
import { personHandle, type ReferralNetwork } from "@/features/referrals/lib/referrals";
import {
  useDownlineBranches,
  type OpenGeneration,
} from "@/features/referrals/hooks/use-referral-network";

interface NetworkPanelProps {
  network: ReferralNetwork | null;
  loading: boolean;
  /** The page owns the gaps between cards, so the card carries none itself. */
  className?: string;
}

/**
 * The reader's network, one row per generation, each opening to the people in
 * it.
 *
 * A generation is the distance from the reader: generation 1 is who they
 * invited, generation 2 is who those people invited, and so on. The rows are
 * closed to begin with because the counts are the answer most of the time, and
 * a generation can hold hundreds of people.
 */
export function NetworkPanel({ network, loading, className }: NetworkPanelProps) {
  const t = useTranslations("referral");
  const branches = useDownlineBranches();

  if (loading) {
    return (
      <ReferralCard className={className}>
        <ReferralCardTitle>{t("networkTitle")}</ReferralCardTitle>
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-[12px] bg-white/[0.04]" />
          ))}
        </div>
      </ReferralCard>
    );
  }

  const generations = network?.generations ?? [];

  return (
    <ReferralCard className={className}>
      <ReferralCardTitle>{t("networkTitle")}</ReferralCardTitle>

      {generations.length === 0 ? (
        <p className="mt-2 text-[12.5px] leading-[1.55] font-normal text-white/45">
          {t("networkEmpty")}
        </p>
      ) : (
        <>
          {/* The two totals are in the page's stat strip now, where they sit
              beside the referral counts they belong with. The panel keeps what
              only it can say: the shape of the network, generation by
              generation. */}
          <ul className="mt-3 flex flex-col gap-1.5">
            {generations.map((generation) => (
              <GenerationRow
                key={generation.generation}
                generation={generation.generation}
                total={generation.total}
                counted={generation.counted}
                open={branches.open[generation.generation]}
                onToggle={() => branches.toggle(generation.generation)}
                onMore={() => branches.more(generation.generation)}
              />
            ))}
          </ul>
        </>
      )}
    </ReferralCard>
  );
}

function GenerationRow({
  generation,
  total,
  counted,
  open,
  onToggle,
  onMore,
}: {
  generation: number;
  total: number;
  counted: number;
  open?: OpenGeneration;
  onToggle: () => void;
  onMore: () => void;
}) {
  const t = useTranslations("referral");
  const expanded = Boolean(open);

  return (
    <li className="overflow-hidden rounded-[12px] border border-white/8 bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <ChevronDownIcon
          size={13}
          className={
            "shrink-0 text-white/40 transition-transform " + (expanded ? "" : "-rotate-90")
          }
        />
        <span className="flex-1 text-[13.5px] font-medium text-white">
          {t("networkGeneration", { n: generation })}
        </span>
        <span className="tnum text-[12.5px] font-normal text-white/45">
          {t("networkRowCounts", { total, counted })}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-white/6 px-3.5 py-2.5">
          {open?.people.length === 0 && !open.loading ? (
            <p className="text-[12.5px] font-normal text-white/40">{t("networkBranchEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {open?.people.map((person) => (
                <li key={person.wallet} className="flex items-center gap-2.5">
                  {/* Counted or not is the only thing that decides whether a
                      referral pays, so it is the one thing each row states. */}
                  <span
                    aria-hidden
                    className={
                      "h-1.5 w-1.5 shrink-0 rounded-full " +
                      (person.qualified ? "bg-up" : "bg-white/25")
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-normal text-white/75">
                    {personHandle(person)}
                  </span>
                  <span className="shrink-0 text-[11px] font-normal text-white/35">
                    {person.qualified ? t("networkCountedTag") : t("networkPendingTag")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {open?.loading ? (
            <p className="mt-2 text-[12px] font-normal text-white/40">{t("networkLoading")}</p>
          ) : null}

          {open?.nextCursor && !open.loading ? (
            <button
              type="button"
              onClick={onMore}
              className="text-accent mt-2.5 cursor-pointer text-[12.5px] font-semibold hover:underline"
            >
              {t("networkMore")}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
