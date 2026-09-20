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
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("Chicken live socket", () => {
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

  it("sends an authenticated command and resolves its acknowledgement", async () => {
    const { sendChickenCommand } = await import("./live-socket");
    const response = sendChickenCommand<{ currentStep: number }>({
      commandId: "command-1",
      action: "step",
      sessionId: "session-1",
      expectedVersion: 1,
      idempotencyKey: "command-1",
    });
    await flush();
    const connection = FakeSocket.instances[0]!;
    expect(connection.url).toContain("token=access-token");
    connection.open();
    connection.message({
      type: "welcome",
      data: { capabilities: { arkjetChickenCommands: true } },
    });

    const command = connection.sent
      .map((raw) => JSON.parse(raw))
      .find((frame) => frame.type === "chickenCommand");
    expect(command).toMatchObject({
      ackId: 1,
      auth: { accessToken: "access-token", identityToken: "identity-token" },
      command: { commandId: "command-1", action: "step" },
    });

    connection.message({
      type: "chickenCommandAck",
      data: { ackId: 1, commandId: "command-1", response: { currentStep: 2 } },
    });
    await expect(response).resolves.toEqual({ currentStep: 2 });
  });

  it("subscribes to the authenticated player topic and delivers Chicken frames", async () => {
    const { subscribeChickenTopic } = await import("./live-socket");
    const listener = vi.fn();
    const unsubscribe = subscribeChickenTopic("did:privy:player", listener);
    await flush();
    const connection = FakeSocket.instances[0]!;
    connection.open();

    expect(connection.sent.map((raw) => JSON.parse(raw))).toContainEqual({
      type: "subscribe",
      topics: ["arkjet:user:did:privy:player"],
      versions: {},
    });
    connection.message({
      type: "chickenStepped",
      topic: "arkjet:user:did:privy:player",
      revision: 1,
      data: { sessionId: "session-1", status: "active", version: 2 },
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chickenStepped", revision: 1 })
    );

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  // A deployed site is told which gateway to use. Ignoring that in production
  // sent Chicken to a host that no longer accepts connections, where it
  // reconnected forever behind the HTTP fallback.
  it("uses the gateway the deployment names, in production too", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { subscribeChickenTopic } = await import("./live-socket");
    const unsubscribe = subscribeChickenTopic("user-1", () => {});
    await flush();

    expect(FakeSocket.instances[0]!.url).toContain("wss://games.test/");

    unsubscribe();
    await vi.advanceTimersByTimeAsync(8_000);
  });

  it("fails fast so an old gateway can use the HTTP fallback", async () => {
    const { sendChickenCommand } = await import("./live-socket");
    const response = sendChickenCommand({ commandId: "command-old", action: "start" });
    await flush();
    const connection = FakeSocket.instances[0]!;
    connection.open();
    connection.message({
      type: "welcome",
      data: { capabilities: { arkjetChickenCommands: false } },
    });

    await expect(response).rejects.toMatchObject({
      code: "SOCKET_COMMANDS_UNAVAILABLE",
      status: 503,
    });
  });
});
