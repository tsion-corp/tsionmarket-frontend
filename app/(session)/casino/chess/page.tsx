import { ChessLobbyFrame } from "@/features/casino/components/chess-app/chess-lobby-frame";

interface ChessLobbyPageProps {
  searchParams: Promise<{
    challenge?: string | string[];
    setup?: string | string[];
    tab?: string | string[];
  }>;
}

export function chessLobbySource(params: {
  challenge?: string | string[];
  setup?: string | string[];
  tab?: string | string[];
}) {
  const challenge = Array.isArray(params.challenge) ? params.challenge[0] : params.challenge;
  if (challenge) return `/api/chess/challenge/${encodeURIComponent(challenge)}`;

  const setup = Array.isArray(params.setup) ? params.setup[0] : params.setup;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const query = new URLSearchParams();
  if (tab === "lobby") query.set("tab", tab);
  if (setup === "friend" || setup === "ai" || setup === "hook") {
    query.set("setup", setup);
  }
  const search = query.toString();
  return `/api/chess/play${search ? `?${search}` : ""}${setup ? "#game-setup" : ""}`;
}

export default async function ChessLobbyPage({ searchParams }: ChessLobbyPageProps) {
  return <ChessLobbyFrame source={chessLobbySource(await searchParams)} />;
}
