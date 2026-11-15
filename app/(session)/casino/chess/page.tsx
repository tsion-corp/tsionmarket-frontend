import { ChessLobbyFrame } from "@/features/casino/components/chess-app/chess-lobby-frame";
import { chessLobbySource } from "@/features/casino/lib/chess-lobby-source";

interface ChessLobbyPageProps {
  searchParams: Promise<{
    challenge?: string | string[];
    setup?: string | string[];
    tab?: string | string[];
  }>;
}

export default async function ChessLobbyPage({ searchParams }: ChessLobbyPageProps) {
  return <ChessLobbyFrame source={chessLobbySource(await searchParams)} />;
}
