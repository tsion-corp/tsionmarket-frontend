import { Avatar } from "@/components/ui/avatar";
import { countryFlag, countryName, playerName, signedNumber } from "./leaderboard-format";
import type {
  ChessLeaderboardPlayer,
  ChessLeaderboardRules,
} from "@/features/casino/lib/api/types";

function Trend({ value }: { value: number }) {
  if (value === 0) return <span className="text-white/18">–</span>;
  const rising = value > 0;
  return <span className={rising ? "text-[#aeb7bc]" : "text-[#947f7f]"}>{rising ? "▲" : "▼"}</span>;
}

function RecordCell({ count, total }: { count: number; total: number }) {
  const percentage = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <span className="group tnum inline-grid min-w-8 cursor-default place-items-center">
      <span className="group-hover:hidden">{count.toLocaleString()}</span>
      <span className="hidden text-white/72 group-hover:inline">{percentage}%</span>
    </span>
  );
}

function EmptyLeaderboard({ rules }: { rules?: ChessLeaderboardRules }) {
  return (
    <div className="grid min-h-[320px] place-items-center px-6 text-center">
      <div className="max-w-[450px]">
        <span className="mx-auto grid size-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] font-serif text-[20px] text-white/36">
          #
        </span>
        <h2 className="mt-4 text-[15px] font-semibold text-white/80">No ranked players yet</h2>
        <p className="mt-1.5 text-[12px] leading-5 text-white/40">
          {rules
            ? `Players enter this table after ${rules.minimumGames} rated games, once their rating is established, and after playing within ${rules.activeWithinDays} days.`
            : "Established active players will appear here as rated games are completed."}
        </p>
      </div>
    </div>
  );
}

export function LeaderboardTable({
  players,
  rules,
  refreshing,
}: {
  players: ChessLeaderboardPlayer[];
  rules?: ChessLeaderboardRules;
  refreshing: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#343a3f] bg-[#15181a] shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
      <div className="grid grid-cols-[26px_42px_minmax(0,1fr)_68px] items-center gap-2 border-b border-[#343a3f] bg-[#1c2023] px-3 py-2.5 text-[9px] font-bold tracking-[0.09em] text-white/35 uppercase md:grid-cols-[28px_48px_minmax(0,1fr)_82px_56px_56px_56px] md:px-4">
        <span aria-label="Rating trend" />
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">Rating</span>
        <span className="hidden text-right md:block">Won</span>
        <span className="hidden text-right md:block">Draw</span>
        <span className="hidden text-right md:block">Lost</span>
      </div>

      {players.length === 0 ? (
        <EmptyLeaderboard rules={rules} />
      ) : (
        <div className={refreshing ? "opacity-65 transition-opacity" : "transition-opacity"}>
          {players.map((player) => {
            const flag = countryFlag(player.countryCode);
            const country = countryName(player.countryCode);
            const total = player.wins + player.draws + player.losses;
            return (
              <div
                key={player.player}
                className="grid min-h-[62px] grid-cols-[26px_42px_minmax(0,1fr)_68px] items-center gap-2 border-t border-[#2e3438] px-3 first:border-t-0 hover:bg-[#202529] md:grid-cols-[28px_48px_minmax(0,1fr)_82px_56px_56px_56px] md:px-4"
              >
                <span className="text-center text-[9px]">
                  <Trend value={player.ratingProgress} />
                </span>
                <span
                  className={`tnum text-[13px] font-bold ${
                    player.rank <= 3 ? "text-white" : "text-white/48"
                  }`}
                >
                  {player.rank.toLocaleString()}
                </span>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar seed={player.player} size={38} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[#eef0f1]">
                      {playerName(player.displayName, player.player)}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-[11.5px] font-semibold text-white/55">
                      <span
                        title={country}
                        className="shrink-0 text-[19px] leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)]"
                      >
                        {flag || "🌐"}
                      </span>
                      <span className="truncate">{player.countryCode ? country : "Global"}</span>
                      <span className="hidden min-[470px]:inline md:hidden">
                        W {player.wins} · D {player.draws} · L {player.losses}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[15px] font-bold text-white">
                    {player.rating.toLocaleString()}
                  </div>
                  <div className="tnum text-[9px] text-white/28">
                    {signedNumber(player.ratingProgress)}
                  </div>
                </div>
                <div className="tnum hidden text-right text-[12px] text-white/48 md:block">
                  <RecordCell count={player.wins} total={total} />
                </div>
                <div className="tnum hidden text-right text-[12px] text-white/48 md:block">
                  <RecordCell count={player.draws} total={total} />
                </div>
                <div className="tnum hidden text-right text-[12px] text-white/48 md:block">
                  <RecordCell count={player.losses} total={total} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
