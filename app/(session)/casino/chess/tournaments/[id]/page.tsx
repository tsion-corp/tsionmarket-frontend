import { ChessLobbyFrame } from "@/features/casino/components/chess-app/chess-lobby-frame";

export default async function ChessTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChessLobbyFrame source={`/api/chess/competition/arenas/${encodeURIComponent(id)}`} />;
}
