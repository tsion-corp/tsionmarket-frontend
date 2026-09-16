import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessMatch } from "@/features/casino/lib/api/types";

const api = vi.hoisted(() => ({
  fetchMatchChat: vi.fn(),
  postMatchChatMessage: vi.fn(),
}));

vi.mock("@/components/providers/server-session", () => ({
  useSessionWallet: () => "0x1111111111111111111111111111111111111111",
}));

vi.mock("@/features/casino/hooks/use-casino-chess", () => ({
  CHESS_KEYS: {
    chat: (id: string, room: string) => ["casino", "chess", "match", id, "chat", room],
  },
}));

vi.mock("@/features/casino/lib/api/chess", () => api);

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn() },
}));

import { LichessSpectatorChat } from "@/features/casino/components/chess-app/lichess-spectator-chat";

const match = {
  id: "30a4d5f7-93f6-4a86-bb9d-42c13d8257fd",
  white: {
    id: "0x1111111111111111111111111111111111111111",
    username: "Alice",
    walletAddress: "0x1111111111111111111111111111111111111111",
  },
  black: {
    id: "0x2222222222222222222222222222222222222222",
    username: "Bob",
    walletAddress: "0x2222222222222222222222222222222222222222",
  },
} as ChessMatch;

describe("LichessSpectatorChat", () => {
  beforeEach(() => {
    api.fetchMatchChat.mockResolvedValue([
      {
        id: 1,
        matchId: match.id,
        room: "spectator",
        author: match.white?.walletAddress,
        text: "Good game",
        createdAt: "2026-09-11T00:00:00Z",
      },
    ]);
    api.postMatchChatMessage.mockResolvedValue({
      id: 2,
      matchId: match.id,
      room: "spectator",
      author: match.black?.walletAddress,
      text: "Well played",
      createdAt: "2026-09-11T00:00:01Z",
    });
  });

  it("renders history and posts new lines into the spectator room", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <LichessSpectatorChat match={match} />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Good game")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();

    const input = screen.getByRole("textbox", { name: "Spectator chat input" });
    fireEvent.change(input, { target: { value: "Well played" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(api.postMatchChatMessage).toHaveBeenCalledWith(match.id, "spectator", "Well played");
    });
    expect(await screen.findByText("Well played")).toBeInTheDocument();
  });
});
