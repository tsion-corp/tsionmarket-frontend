"use client";

import type {
  ArkjetBet,
  ArkjetRound,
  ArkjetSimulatedActivityFeed,
} from "@/features/casino/lib/api/arkjet";
import { resolveAuthTokens } from "@/lib/auth-token";
import { apiError } from "@/lib/api/envelope";

const LOCAL_WS_URL = "ws://127.0.0.1:8100";
// The live gateway, not the retired staging host, for a deployment that names
// none of its own.
const DEPLOYED_WS_URL = "wss://ws.tsionark.com";
// A variable set to nothing is a variable nobody set: it must not resolve to
// an empty address.
const NAMED_WS_URL = process.env.NEXT_PUBLIC_CHESS_WS_URL?.trim();
const WS_URL =
  NAMED_WS_URL !== undefined && NAMED_WS_URL !== ""
    ? NAMED_WS_URL
    : process.env.NODE_ENV === "production"
      ? DEPLOYED_WS_URL
      : LOCAL_WS_URL;
const COMMAND_RETRY_MS = 2_500;
const COMMAND_DEADLINE_MS = 15_000;
const IDLE_KEEPALIVE_MS = 8_000;

export interface ArkjetGatewayFrame {
  type?: string;
  topic?: string;
  data?: unknown;
  revision?: number;
  snapshot?: boolean;
}

export const ARKJET_SOCKET_CLOSED: ArkjetGatewayFrame = { type: "__closed" };
export const ARKJET_SOCKET_READY: ArkjetGatewayFrame = { type: "__ready" };
export const ARKJET_SOCKET_RESYNC: ArkjetGatewayFrame = { type: "__resync" };

type Listener = (frame: ArkjetGatewayFrame) => void;

interface PendingCommand {
  ackId: number;
  commandId: string;
  frame: Record<string, unknown>;
  deadline: number;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
}

let socket: WebSocket | null = null;
let opening: Promise<void> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let idleCloseTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectDelay = 2_000;
let nextAckId = 1;
let commandCapability: boolean | null = null;
let activeAccessToken: string | null = null;
let activeTopics = new Set<string>();
const topicRevisions = new Map<string, number>();
const listeners = new Set<Listener>();
const pendingCommands = new Map<number, PendingCommand>();

function socketUrl(accessToken: string | null): string {
  const url = new URL(WS_URL);
  if (accessToken) url.searchParams.set("token", accessToken);
  return url.toString();
}

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function notify(frame: ArkjetGatewayFrame): void {
  for (const listener of listeners) listener(frame);
}

function commandError(code: string, message: string, status: number, details?: unknown): Error {
  return apiError(code, message, status, details);
}

function finish(command: PendingCommand): void {
  if (command.timer) clearTimeout(command.timer);
  pendingCommands.delete(command.ackId);
  if (listeners.size === 0 && pendingCommands.size === 0) scheduleIdleClose();
}

function rejectPending(command: PendingCommand, error: Error): void {
  finish(command);
  command.reject(error);
}

function rejectAll(error: Error): void {
  for (const command of [...pendingCommands.values()]) rejectPending(command, error);
}

function scheduleRetry(command: PendingCommand): void {
  if (!pendingCommands.has(command.ackId) || command.timer) return;
  const remaining = command.deadline - Date.now();
  command.timer = setTimeout(
    () => {
      command.timer = null;
      if (!pendingCommands.has(command.ackId)) return;
      if (Date.now() >= command.deadline) {
        notify({ ...ARKJET_SOCKET_RESYNC, data: { reason: "command_ack_timeout" } });
        rejectPending(
          command,
          commandError(
            "SOCKET_COMMAND_TIMEOUT",
            "Arkjet did not acknowledge that action in time.",
            504
          )
        );
        return;
      }
      if (socket?.readyState === WebSocket.OPEN) send(command.frame);
      else void open();
      scheduleRetry(command);
    },
    Math.max(1, Math.min(COMMAND_RETRY_MS, remaining))
  );
}

function sendPending(): void {
  if (socket?.readyState !== WebSocket.OPEN || commandCapability === false) return;
  for (const command of pendingCommands.values()) {
    send(command.frame);
    scheduleRetry(command);
  }
}

function subscribe(): void {
  if (activeTopics.size === 0) return;
  send({
    type: "subscribe",
    topics: [...activeTopics],
    versions: Object.fromEntries(
      [...activeTopics]
        .map((topic) => [topic, topicRevisions.get(topic)] as const)
        .filter((entry): entry is readonly [string, number] => entry[1] !== undefined)
    ),
  });
}

function handleControl(frame: ArkjetGatewayFrame): boolean {
  if (frame.type === "welcome") {
    const data = frame.data as { capabilities?: { arkjetCommands?: unknown } } | null;
    const capability = data?.capabilities?.arkjetCommands;
    commandCapability = typeof capability === "boolean" ? capability : null;
    if (commandCapability === false) {
      rejectAll(
        commandError(
          "SOCKET_COMMANDS_UNAVAILABLE",
          "This gateway does not support Arkjet commands yet.",
          503
        )
      );
    }
    return true;
  }
  if (frame.type === "arkjetCommandAck") {
    const data = frame.data as { ackId?: unknown; response?: unknown } | null;
    if (typeof data?.ackId !== "number") return true;
    const command = pendingCommands.get(data.ackId);
    if (!command) return true;
    finish(command);
    command.resolve(data.response);
    return true;
  }
  if (frame.type === "arkjetCommandError") {
    const data = frame.data as {
      ackId?: unknown;
      status?: unknown;
      code?: unknown;
      message?: unknown;
      retryable?: unknown;
    } | null;
    const command = typeof data?.ackId === "number" ? pendingCommands.get(data.ackId) : null;
    if (!command) return true;
    const status = typeof data?.status === "number" ? data.status : 500;
    const code = typeof data?.code === "string" ? data.code : "ARKJET_COMMAND_FAILED";
    const message =
      typeof data?.message === "string" ? data.message : "Arkjet could not apply that action.";
    if (data?.retryable === true && code !== "SOCKET_COMMANDS_UNAVAILABLE") {
      scheduleRetry(command);
      return true;
    }
    rejectPending(command, commandError(code, message, status, data));
    return true;
  }
  if (frame.type === "subscribed") {
    const data = frame.data as { topics?: unknown } | null;
    if (
      Array.isArray(data?.topics) &&
      data.topics.some((topic) => activeTopics.has(String(topic)))
    ) {
      reconnectDelay = 2_000;
      notify(ARKJET_SOCKET_READY);
    }
    return true;
  }
  if (frame.type === "resync") {
    notify({ ...ARKJET_SOCKET_RESYNC, data: frame.data });
    return true;
  }
  if (frame.type === "error") {
    const data = frame.data as { message?: unknown } | null;
    if (
      typeof data?.message === "string" &&
      data.message.includes("unknown control type: arkjetCommand")
    ) {
      commandCapability = false;
      rejectAll(commandError("SOCKET_COMMANDS_UNAVAILABLE", data.message, 503));
    }
    return true;
  }
  return frame.type === "pong" || frame.type === "authenticated" || frame.type === "unsubscribed";
}

function handleData(frame: ArkjetGatewayFrame): void {
  const topic = frame.topic;
  if (!topic || !activeTopics.has(topic)) return;
  if (typeof frame.revision === "number") {
    const lastRevision = topicRevisions.get(topic);
    if (lastRevision !== undefined && frame.revision <= lastRevision) return;
    if (
      lastRevision !== undefined &&
      frame.revision > lastRevision + 1 &&
      frame.snapshot !== true
    ) {
      topicRevisions.set(topic, frame.revision);
      notify({ ...ARKJET_SOCKET_RESYNC, topic, data: { reason: "revision_gap" } });
      return;
    }
    topicRevisions.set(topic, frame.revision);
  }
  if (
    frame.type === "roundCommitted" ||
    frame.type === "roundLocked" ||
    frame.type === "roundStarted" ||
    frame.type === "roundRevealed" ||
    frame.type === "multiplier" ||
    frame.type === "betAccepted" ||
    frame.type === "betCancelled" ||
    frame.type === "betCashedOut" ||
    frame.type === "simulatedActivityOpened" ||
    frame.type === "simulatedActivityStarted" ||
    frame.type === "simulatedActivityUpdated" ||
    frame.type === "simulatedActivitySettled"
  ) {
    notify(frame);
  }
}

async function resolveAccessToken(): Promise<string | null> {
  try {
    const tokens = await resolveAuthTokens();
    return tokens.accessToken;
  } catch {
    return null;
  }
}

async function open(): Promise<void> {
  if (socket?.readyState === WebSocket.OPEN) {
    const accessToken = await resolveAccessToken();
    if (accessToken && accessToken !== activeAccessToken) {
      activeAccessToken = accessToken;
      send({ type: "authenticate", token: accessToken });
    }
    return;
  }
  if (socket?.readyState === WebSocket.CONNECTING) return;
  if (opening) return opening;

  opening = (async () => {
    activeAccessToken = await resolveAccessToken();
    let connection: WebSocket;
    try {
      connection = new WebSocket(socketUrl(activeAccessToken));
    } catch {
      rejectAll(commandError("SOCKET_UNAVAILABLE", "Arkjet live play is unavailable.", 503));
      return;
    }
    socket = connection;
    connection.onopen = () => {
      if (socket !== connection) return;
      if (activeAccessToken) send({ type: "authenticate", token: activeAccessToken });
      subscribe();
      sendPending();
      pingTimer = setInterval(() => send({ type: "ping", sentAt: Date.now() }), 25_000);
    };
    connection.onmessage = (event) => {
      if (socket !== connection) return;
      let frame: ArkjetGatewayFrame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!handleControl(frame)) handleData(frame);
    };
    connection.onclose = () => {
      if (socket !== connection) return;
      socket = null;
      commandCapability = null;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      notify(ARKJET_SOCKET_CLOSED);
      if (listeners.size > 0 || pendingCommands.size > 0) scheduleReconnect();
    };
    connection.onerror = () => connection.close();
  })().finally(() => {
    opening = null;
  });
  return opening;
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void open();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
}

function scheduleIdleClose(): void {
  if (idleCloseTimer) return;
  idleCloseTimer = setTimeout(() => {
    idleCloseTimer = null;
    if (listeners.size > 0 || pendingCommands.size > 0) return;
    socket?.close();
    socket = null;
    activeAccessToken = null;
    commandCapability = null;
  }, IDLE_KEEPALIVE_MS);
}

export function isArkjetRound(value: unknown): value is ArkjetRound {
  if (!value || typeof value !== "object") return false;
  const round = value as Partial<ArkjetRound>;
  return (
    typeof round.roundId === "string" &&
    typeof round.sequence === "number" &&
    typeof round.status === "string"
  );
}

export function isArkjetBet(value: unknown): value is ArkjetBet {
  if (!value || typeof value !== "object") return false;
  const bet = value as Partial<ArkjetBet>;
  return typeof bet.betId === "string" && typeof bet.roundId === "string";
}

export function isArkjetSimulatedActivityFeed(
  value: unknown
): value is ArkjetSimulatedActivityFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Partial<ArkjetSimulatedActivityFeed>;
  return (
    typeof feed.roundId === "string" &&
    feed.source === "simulation" &&
    feed.isSimulated === true &&
    Array.isArray(feed.items) &&
    feed.items.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as { activityId?: unknown }).activityId === "string" &&
        (item as { isSimulated?: unknown }).isSimulated === true
    )
  );
}

export async function sendArkjetCommand<T>(command: Record<string, unknown>): Promise<T> {
  const commandId = command.commandId;
  if (typeof commandId !== "string") {
    throw commandError("BAD_REQUEST", "An Arkjet command ID is required.", 400);
  }
  const { accessToken, idToken } = await resolveAuthTokens();
  if (!accessToken) {
    throw commandError("UNAUTHORIZED", "Sign in again to play Arkjet.", 401);
  }
  if (commandCapability === false) {
    throw commandError(
      "SOCKET_COMMANDS_UNAVAILABLE",
      "This gateway does not support Arkjet commands yet.",
      503
    );
  }
  activeAccessToken = accessToken;
  if (socket?.readyState === WebSocket.OPEN) {
    send({ type: "authenticate", token: accessToken });
  }

  const ackId = nextAckId;
  nextAckId = nextAckId >= Number.MAX_SAFE_INTEGER ? 1 : nextAckId + 1;
  return new Promise<T>((resolve, reject) => {
    const pending: PendingCommand = {
      ackId,
      commandId,
      frame: {
        type: "arkjetCommand",
        ackId,
        auth: { accessToken, ...(idToken ? { identityToken: idToken } : {}) },
        command,
      },
      deadline: Date.now() + COMMAND_DEADLINE_MS,
      timer: null,
      resolve: (response) => resolve(response as T),
      reject,
    };
    pendingCommands.set(ackId, pending);
    if (idleCloseTimer) clearTimeout(idleCloseTimer);
    idleCloseTimer = null;
    void open().then(() => {
      if (socket?.readyState === WebSocket.OPEN && pendingCommands.has(ackId)) {
        send(pending.frame);
      }
      scheduleRetry(pending);
    });
  });
}

export function subscribeArkjetTopics(userId: string | null, listener: Listener): () => void {
  const nextTopics = new Set(["arkjet:rounds"]);
  if (userId) nextTopics.add(`arkjet:user:${userId}`);
  for (const topic of activeTopics) {
    if (!nextTopics.has(topic)) {
      send({ type: "unsubscribe", topics: [topic] });
      topicRevisions.delete(topic);
    }
  }
  activeTopics = nextTopics;
  listeners.add(listener);
  if (idleCloseTimer) clearTimeout(idleCloseTimer);
  idleCloseTimer = null;
  void open().then(() => {
    if (socket?.readyState === WebSocket.OPEN) subscribe();
  });

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      send({ type: "unsubscribe", topics: [...activeTopics] });
      activeTopics.clear();
      topicRevisions.clear();
      scheduleIdleClose();
    }
  };
}
