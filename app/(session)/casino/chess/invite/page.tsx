import { ChessLobbyFrame } from "@/features/casino/components/chess-app/chess-lobby-frame";
import { chessInviteSource } from "@/features/casino/lib/chess-lobby-source";

export default async function ChessInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const rawCode = (await searchParams).code;
  return <ChessLobbyFrame source={chessInviteSource(rawCode)} />;
}
