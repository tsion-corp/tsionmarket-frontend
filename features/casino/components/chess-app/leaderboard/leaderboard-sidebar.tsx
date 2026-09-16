import { Avatar } from "@/components/ui/avatar";
import { countryFlag, countryName, playerName } from "./leaderboard-format";
import { RatingSparkline } from "./rating-sparkline";
import type {
  ChessLeaderboardRules,
  ChessPlayerRatingChart,
  ChessPlayerRatingStats,
  ChessRatingPoolStats,
} from "@/features/casino/lib/api/types";

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-t border-white/[0.065] px-4 py-2 first:border-t-0">
      <span className="text-[11.5px] text-white/42">{label}</span>
      <span className="tnum text-right text-[12px] font-semibold text-white/84">{value}</span>
    </div>
  );
}

function PersonalRatingCard({
  profileName,
  avatarSeed,
  perf,
  stats,
  chart,
  rules,
}: {
  profileName: string;
  avatarSeed: string;
  perf: string;
  stats?: ChessPlayerRatingStats;
  chart?: ChessPlayerRatingChart;
  rules?: ChessLeaderboardRules;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#343a3f] bg-[#171a1d] shadow-[0_18px_54px_rgba(0,0,0,0.28)]">
      <div className="px-4 pt-5 text-center">
        <Avatar seed={stats?.player ?? avatarSeed} size={76} />
        <div className="mt-2 truncate text-[14px] font-semibold text-white/88">
          {stats ? playerName(stats.displayName, stats.player) : profileName}
        </div>
        {stats?.countryCode ? (
          <div className="mt-2 flex justify-center">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-white/12 bg-[#23282c] px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_5px_16px_rgba(0,0,0,0.25)]">
              <span className="text-[25px] leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                {countryFlag(stats.countryCode)}
              </span>
              <span className="text-[13px] font-bold tracking-[0.01em] text-white/78">
                {countryName(stats.countryCode)}
              </span>
            </span>
          </div>
        ) : (
          <div className="mt-2 text-[11.5px] font-semibold text-white/45">Your {perf} profile</div>
        )}
      </div>

      <div className="mt-4 border-y border-white/[0.065] bg-black/15 px-3 pt-3">
        <RatingSparkline points={chart?.points ?? []} />
      </div>

      <div>
        <StatRow
          label="Rating"
          value={(stats?.rating ?? rules?.initialRating ?? 100).toLocaleString()}
        />
        <StatRow
          label="Percentile"
          value={stats?.percentile == null ? "—" : `${stats.percentile.toFixed(1)}%`}
        />
        <StatRow
          label="Global rank"
          value={stats?.globalRank ? `#${stats.globalRank.toLocaleString()}` : "—"}
        />
        <StatRow
          label="Status"
          value={stats?.provisional === false ? "Established" : "Provisional"}
        />
        <StatRow
          label="Record"
          value={
            stats
              ? `${stats.record.wins} / ${stats.record.draws} / ${stats.record.losses}`
              : "0 / 0 / 0"
          }
        />
      </div>
    </section>
  );
}

function PoolCard({
  stats,
  scope,
  perf,
}: {
  stats?: ChessRatingPoolStats;
  scope: string;
  perf: string;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#343a3f] bg-[#171a1d]">
      <h2 className="border-b border-white/[0.065] bg-[#1c2023] px-4 py-3 text-[13px] font-semibold text-white/82">
        {scope} {perf} stats
      </h2>
      <StatRow label="Players" value={(stats?.playerCount ?? 0).toLocaleString()} />
      <StatRow
        label="Avg rating"
        value={
          stats?.averageRating == null ? "—" : Math.round(stats.averageRating).toLocaleString()
        }
      />
      <StatRow
        label="Median rating"
        value={stats?.medianRating == null ? "—" : Math.round(stats.medianRating).toLocaleString()}
      />
      <StatRow label="Live games" value={(stats?.liveGames ?? 0).toLocaleString()} />
    </section>
  );
}

function RulesCard({ rules }: { rules?: ChessLeaderboardRules }) {
  return (
    <section className="rounded-[10px] border border-[#343a3f] bg-[#171a1d] px-4 py-3.5">
      <h2 className="text-[12.5px] font-semibold text-white/80">Leaderboard rules</h2>
      <p className="mt-1.5 text-[10.5px] leading-[17px] text-white/40">
        Start at {rules?.initialRating ?? 100}. Rankings require {rules?.minimumGames ?? 2} rated
        games, an established rating, and recent activity. Ratings stay between{" "}
        {rules?.minimumRating ?? 100} and {rules?.maximumRating ?? 4000}.
      </p>
    </section>
  );
}

export function LeaderboardSidebar({
  profileName,
  avatarSeed,
  perf,
  scope,
  playerStats,
  playerChart,
  pool,
  rules,
}: {
  profileName: string;
  avatarSeed: string;
  perf: string;
  scope: string;
  playerStats?: ChessPlayerRatingStats;
  playerChart?: ChessPlayerRatingChart;
  pool?: ChessRatingPoolStats;
  rules?: ChessLeaderboardRules;
}) {
  return (
    <aside className="space-y-3 lg:sticky lg:top-[72px]">
      <PersonalRatingCard
        profileName={profileName}
        avatarSeed={avatarSeed}
        perf={perf}
        stats={playerStats}
        chart={playerChart}
        rules={rules}
      />
      <PoolCard stats={pool} scope={scope} perf={perf} />
      <RulesCard rules={rules} />
    </aside>
  );
}
