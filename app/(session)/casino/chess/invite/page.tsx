import { ChessLobbyFrame } from "@/features/casino/components/chess-app/chess-lobby-frame";

export function chessInviteSource(code?: string | string[]) {
  const inviteCode = Array.isArray(code) ? code[0] : code;
  return inviteCode
    ? `/api/chess/challenge/invite/${encodeURIComponent(inviteCode)}`
    : "/api/chess/play?setup=friend#game-setup";
}

export default async function ChessInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const rawCode = (await searchParams).code;
  return <ChessLobbyFrame source={chessInviteSource(rawCode)} />;
}
