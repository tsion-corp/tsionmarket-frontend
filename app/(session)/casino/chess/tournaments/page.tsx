import { ChessLobbyFrame } from "@/features/casino/components/chess-app/chess-lobby-frame";

export default function ChessTournamentsPage() {
  return <ChessLobbyFrame source="/api/chess/competition/arenas" />;
}
