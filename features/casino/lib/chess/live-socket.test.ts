// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/privy-token", () => ({
  resolveAuthTokens: vi.fn().mockResolvedValue({
    accessToken: "access-token",
    idToken: "identity-token",
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
    if (this.readyState !== FakeSocket.OPEN) throw new Error("socket is not open");
    this.sent.push(data);
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  message(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  closed(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  close(): void {
    this.readyState = 3;
  }
}

describe("chess live socket replay", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubEnv("NEXT_PUBLIC_CHESS_WS_URL", "wss://chess.test/");
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // The deployment names its gateway. Production ignored that and used a
  // hardcoded staging host, which no longer accepts connections at all.
  it("uses the gateway the deployment names, in production too", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { subscribeChessTopic } = await import("@/features/casino/lib/chess/live-socket");
    const unsubscribe = subscribeChessTopic("chess:match:match-1", () => {});

    expect(FakeSocket.instances[0]!.url).toContain("wss://chess.test/");

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("reconnects with the last delivered topic revision", async () => {
    const { subscribeChessTopic } = await import("@/features/casino/lib/chess/live-socket");
    const topic = "chess:match:match-1";
    const listener = vi.fn();
    const unsubscribe = subscribeChessTopic(topic, listener);
    const first = FakeSocket.instances[0]!;

    first.open();
    expect(JSON.parse(first.sent[0]!)).toEqual({
      type: "subscribe",
      topics: [topic],
      versions: {},
    });
    first.message({ type: "subscribed", data: { topics: [topic], versions: { [topic]: 12 } } });
    first.message({
      type: "position",
      topic,
      revision: 12,
      snapshot: true,
      data: { ply: 12 },
    });
    expect(listener.mock.calls.map(([frame]) => frame.type)).toEqual(["__ready", "position"]);

    first.closed();
    await vi.advanceTimersByTimeAsync(2_000);
    const second = FakeSocket.instances[1]!;
    second.open();

    expect(JSON.parse(second.sent[0]!)).toEqual({
      type: "subscribe",
      topics: [topic],
      versions: { [topic]: 12 },
    });
    second.message({ type: "subscribed", data: { topics: [topic], versions: { [topic]: 13 } } });
    second.message({ type: "position", topic, revision: 13, data: { ply: 13 } });
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ type: "position", revision: 13 });

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("drops duplicate frames and requests repair instead of applying a gap", async () => {
    const { subscribeChessTopic } = await import("@/features/casino/lib/chess/live-socket");
    const topic = "chess:match:match-2";
    const listener = vi.fn();
    const unsubscribe = subscribeChessTopic(topic, listener);
    const connection = FakeSocket.instances[0]!;

    connection.open();
    connection.message({ type: "position", topic, revision: 8, data: { ply: 8 } });
    connection.message({ type: "position", topic, revision: 8, data: { ply: 8 } });
    connection.message({ type: "position", topic, revision: 10, data: { ply: 10 } });

    expect(listener.mock.calls.map(([frame]) => frame.type)).toEqual(["position", "__resync"]);
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "__resync",
      topic,
      data: { reason: "revision_gap" },
    });

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("reconnects immediately when the browser comes back online", async () => {
    const { subscribeChessTopic } = await import("@/features/casino/lib/chess/live-socket");
    const unsubscribe = subscribeChessTopic("chess:match:match-3", vi.fn());
    const first = FakeSocket.instances[0]!;
    first.closed();

    window.dispatchEvent(new Event("online"));

    expect(FakeSocket.instances).toHaveLength(2);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("resends one command with stable IDs until the gateway acknowledges it", async () => {
    const { sendChessRoundCommand, subscribeChessTopic } =
      await import("@/features/casino/lib/chess/live-socket");
    const topic = "chess:match:match-4";
    const unsubscribe = subscribeChessTopic(topic, vi.fn());
    const connection = FakeSocket.instances[0]!;
    connection.open();
    connection.message({
      type: "welcome",
      data: { capabilities: { chessRoundCommands: true } },
    });

    const response = sendChessRoundCommand<{ status: string }>({
      commandId: "command-1",
      matchId: "match-1",
      player: "0x1111111111111111111111111111111111111111",
      expectedPly: 0,
      command: { type: "move", uci: "e2e4" },
    });
    await Promise.resolve();
    await Promise.resolve();

    const first = connection.sent
      .map((raw) => JSON.parse(raw))
      .find((frame) => frame.type === "roundCommand");
    expect(first).toMatchObject({
      type: "roundCommand",
      ackId: 1,
      auth: { accessToken: "access-token", identityToken: "identity-token" },
      command: { commandId: "command-1", matchId: "match-1" },
    });

    await vi.advanceTimersByTimeAsync(2_500);
    const attempts = connection.sent
      .map((raw) => JSON.parse(raw))
      .filter((frame) => frame.type === "roundCommand");
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);

    connection.message({
      type: "roundCommandAck",
      data: { ackId: 1, commandId: "command-1", response: { status: "applied" } },
    });
    await expect(response).resolves.toEqual({ status: "applied" });

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("replays an unacknowledged command with stable IDs after reconnect", async () => {
    const { sendChessRoundCommand, subscribeChessTopic } =
      await import("@/features/casino/lib/chess/live-socket");
    const unsubscribe = subscribeChessTopic("chess:match:match-5", vi.fn());
    const firstConnection = FakeSocket.instances[0]!;
    firstConnection.open();
    firstConnection.message({
      type: "welcome",
      data: { capabilities: { chessRoundCommands: true } },
    });

    const response = sendChessRoundCommand<{ status: string }>({
      commandId: "command-reconnect",
      matchId: "match-5",
      player: "0x1111111111111111111111111111111111111111",
      expectedPly: 4,
      command: { type: "move", uci: "g1f3" },
    });
    await Promise.resolve();
    await Promise.resolve();
    const original = firstConnection.sent
      .map((raw) => JSON.parse(raw))
      .find((frame) => frame.type === "roundCommand");

    firstConnection.closed();
    await vi.advanceTimersByTimeAsync(2_000);
    const secondConnection = FakeSocket.instances[1]!;
    secondConnection.open();
    const replay = secondConnection.sent
      .map((raw) => JSON.parse(raw))
      .find((frame) => frame.type === "roundCommand");
    expect(replay).toEqual(original);

    secondConnection.message({
      type: "roundCommandAck",
      data: {
        ackId: replay.ackId,
        commandId: "command-reconnect",
        response: { status: "replayed" },
      },
    });
    await expect(response).resolves.toEqual({ status: "replayed" });

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("fails fast for an old gateway so the caller can use rolling-deploy fallback", async () => {
    const { sendChessRoundCommand, subscribeChessTopic } =
      await import("@/features/casino/lib/chess/live-socket");
    const unsubscribe = subscribeChessTopic("chess:match:match-2", vi.fn());
    const connection = FakeSocket.instances[0]!;
    connection.open();
    connection.message({
      type: "welcome",
      data: { capabilities: { chessRoundCommands: false } },
    });

    await expect(
      sendChessRoundCommand({ commandId: "command-2", matchId: "match-2" })
    ).rejects.toMatchObject({ code: "SOCKET_COMMANDS_UNAVAILABLE", status: 503 });

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  // This used to pin production to a hardcoded host so a stale variable could
  // not misdirect it. That host (ws-staging) now answers 502, while the
  // variable both deployments set names the live gateway, so the pin was the
  // thing misdirecting production. A deployment that names no gateway falls
  // back to the live one rather than the retired staging host.
  it("falls back to the live gateway when the deployment names none", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CHESS_WS_URL", "");

    const { subscribeChessTopic } = await import("@/features/casino/lib/chess/live-socket");
    const unsubscribe = subscribeChessTopic("chess:match:production", vi.fn());

    expect(FakeSocket.instances[0]?.url).toBe("wss://ws.tsionark.com");

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });
});
