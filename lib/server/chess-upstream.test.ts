import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEPLOYED_CHESS_API,
  chessUpstreamBase,
  chessUpstreamCandidates,
} from "@/lib/server/chess-upstream";

describe("chess upstream routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pins deployed chess traffic to the production ledger", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHESS_API_URL", "https://api.tsionark.com/v1/chess");
    vi.stubEnv("NEXT_PUBLIC_CHESS_API_URL", "https://legacy.example/chess");

    expect(chessUpstreamCandidates()).toEqual([DEPLOYED_CHESS_API]);
    expect(chessUpstreamBase()).toBe("https://api.tsionark.com/v1/chess");
  });

  it("keeps the explicit and local Chess APIs first in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CHESS_API_URL", "http://127.0.0.1:18083");
    vi.stubEnv("NEXT_PUBLIC_CHESS_API_URL", "https://legacy.example/chess");

    expect(chessUpstreamCandidates()).toEqual([
      "http://127.0.0.1:18083",
      "http://127.0.0.1:8082",
      "https://legacy.example/chess",
      DEPLOYED_CHESS_API,
    ]);
  });
});
