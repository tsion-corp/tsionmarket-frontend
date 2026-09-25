// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-token", () => ({
  resolveAuthTokens: vi.fn().mockResolvedValue({
    accessToken: "decane-access-token",
    idToken: null,
  }),
}));

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  message(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("Arkjet live socket", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubEnv("NEXT_PUBLIC_CHESS_WS_URL", "wss://games.test/");
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends an authenticated Arkjet command and resolves its acknowledgement", async () => {
    const { sendArkjetCommand } = await import("./live-socket");
    const response = sendArkjetCommand<{ betId: string }>({
      commandId: "command-1",
      action: "placeBet",
      roundId: "round-1",
      panelId: "A",
      amount: "0.1",
      currency: "USDC",
      idempotencyKey: "command-1",
    });
    await flush();
    const connection = FakeSocket.instances[0]!;
    expect(connection.url).toContain("token=decane-access-token");
    connection.open();
    connection.message({
      type: "welcome",
      data: { capabilities: { arkjetCommands: true } },
    });

    const command = connection.sent
      .map((raw) => JSON.parse(raw))
      .find((frame) => frame.type === "arkjetCommand");
    expect(command).toMatchObject({
      ackId: 1,
      auth: { accessToken: "decane-access-token" },
      command: { commandId: "command-1", action: "placeBet" },
    });
    expect(command.auth).not.toHaveProperty("identityToken");

    connection.message({
      type: "arkjetCommandAck",
      data: { ackId: 1, commandId: "command-1", response: { betId: "bet-1" } },
    });
    await expect(response).resolves.toEqual({ betId: "bet-1" });
  });

  it("subscribes to public rounds and the authenticated player topic", async () => {
    const { subscribeArkjetTopics } = await import("./live-socket");
    const listener = vi.fn();
    const unsubscribe = subscribeArkjetTopics("did:privy:player", listener);
    await flush();
    const connection = FakeSocket.instances[0]!;
    connection.open();

    expect(connection.sent.map((raw) => JSON.parse(raw))).toContainEqual({
      type: "subscribe",
      topics: ["arkjet:rounds", "arkjet:user:did:privy:player"],
      versions: {},
    });
    connection.message({
      type: "multiplier",
      topic: "arkjet:rounds",
      revision: 1,
      data: { roundId: "round-1", sequence: 1, multiplier: "1.12" },
    });
    connection.message({
      type: "betAccepted",
      topic: "arkjet:user:did:privy:player",
      revision: 1,
      data: { betId: "bet-1", roundId: "round-1", status: "ACCEPTED" },
    });
    connection.message({
      type: "simulatedActivityUpdated",
      topic: "arkjet:rounds",
      revision: 2,
      data: { roundId: "round-1", source: "simulation", isSimulated: true, items: [] },
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "multiplier", revision: 1 })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "betAccepted", revision: 1 })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "simulatedActivityUpdated", revision: 2 })
    );

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("fails fast so an old gateway can use the HTTP fallback", async () => {
    const { sendArkjetCommand } = await import("./live-socket");
    const response = sendArkjetCommand({ commandId: "command-old", action: "cashoutBet" });
    await flush();
    const connection = FakeSocket.instances[0]!;
    connection.open();
    connection.message({
      type: "welcome",
      data: { capabilities: { arkjetCommands: false } },
    });

    await expect(response).rejects.toMatchObject({
      code: "SOCKET_COMMANDS_UNAVAILABLE",
      status: 503,
    });
  });
});
