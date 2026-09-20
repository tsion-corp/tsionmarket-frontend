"use client";

import type { ChickenSession } from "@/features/casino/lib/api/arkjet";
import { apiError } from "@/lib/api/envelope";
import { resolveAuthTokens } from "@/lib/privy-token";

const LOCAL_WS_URL = "ws://127.0.0.1:8100";
// See the note in the chess socket: the deployment's own variable wins, and the
// fallback is the live gateway rather than the retired staging host.
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

export interface ChickenGatewayFrame {
  type?: string;
  topic?: string;
  data?: unknown;
  revision?: number;
  snapshot?: boolean;
}

export const CHICKEN_SOCKET_CLOSED: ChickenGatewayFrame = { type: "__closed" };
export const CHICKEN_SOCKET_READY: ChickenGatewayFrame = { type: "__ready" };
export const CHICKEN_SOCKET_RESYNC: ChickenGatewayFrame = { type: "__resync" };

type Listener = (frame: ChickenGatewayFrame) => void;

interface PendingCommand {
  ackId: number;
  commandId: string;
  frame: Record<string, unknown>;
  deadline: number;
  sentAt: number | null;
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
let activeTopic: string | null = null;
let activeAccessToken: string | null = null;
let lastRevision: number | null = null;
const listeners = new Set<Listener>();
const pendingCommands = new Map<number, PendingCommand>();

function socketUrl(accessToken: string): string {
  const url = new URL(WS_URL);
  url.searchParams.set("token", accessToken);
  return url.toString();
}

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function notify(frame: ChickenGatewayFrame): void {
  for (const listener of listeners) listener(frame);
}

function commandError(code: string, message: string, status: number, details?: unknown): Error {
  return apiError(code, message, status, details);
}

function finish(command: PendingCommand): void {
  if (command.timer) clearTimeout(command.timer);
  command.timer = null;
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
        notify({ ...CHICKEN_SOCKET_RESYNC, data: { reason: "command_ack_timeout" } });
        rejectPending(
          command,
          commandError(
            "SOCKET_COMMAND_TIMEOUT",
            "Chicken did not acknowledge the crossing in time.",
            504
          )
        );
        return;
      }
      if (socket?.readyState === WebSocket.OPEN) {
        send(command.frame);
        command.sentAt = Date.now();
      } else {
        void open();
      }
      scheduleRetry(command);
    },
    Math.max(1, Math.min(COMMAND_RETRY_MS, remaining))
  );
}

function sendPending(): void {
  if (socket?.readyState !== WebSocket.OPEN || commandCapability === false) return;
  for (const command of pendingCommands.values()) {
    send(command.frame);
    command.sentAt = Date.now();
    scheduleRetry(command);
  }
}

function subscribe(): void {
  if (!activeTopic) return;
  send({
    type: "subscribe",
    topics: [activeTopic],
    versions: lastRevision === null ? {} : { [activeTopic]: lastRevision },
  });
}

function handleControl(frame: ChickenGatewayFrame): boolean {
  if (frame.type === "welcome") {
    const data = frame.data as {
      capabilities?: { arkjetChickenCommands?: unknown };
    } | null;
    const capability = data?.capabilities?.arkjetChickenCommands;
    commandCapability = typeof capability === "boolean" ? capability : null;
    if (commandCapability === false) {
      rejectAll(
        commandError(
          "SOCKET_COMMANDS_UNAVAILABLE",
          "This gateway does not support Chicken commands yet.",
          503
        )
      );
    }
    return true;
  }
  if (frame.type === "chickenCommandAck") {
    const data = frame.data as { ackId?: unknown; response?: unknown } | null;
    if (typeof data?.ackId !== "number") return true;
    const command = pendingCommands.get(data.ackId);
    if (!command) return true;
    finish(command);
    command.resolve(data.response);
    return true;
  }
  if (frame.type === "chickenCommandError") {
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
    const code = typeof data?.code === "string" ? data.code : "CHICKEN_COMMAND_FAILED";
    const message =
      typeof data?.message === "string" ? data.message : "Chicken could not apply that command.";
    if (data?.retryable === true && code !== "SOCKET_COMMANDS_UNAVAILABLE") {
      scheduleRetry(command);
      return true;
    }
    rejectPending(command, commandError(code, message, status, data));
    return true;
  }
  if (frame.type === "subscribed") {
    const data = frame.data as { topics?: unknown } | null;
    if (Array.isArray(data?.topics) && activeTopic && data.topics.includes(activeTopic)) {
      reconnectDelay = 2_000;
      notify({ ...CHICKEN_SOCKET_READY, topic: activeTopic });
    }
    return true;
  }
  if (frame.type === "resync") {
    notify({ ...CHICKEN_SOCKET_RESYNC, data: frame.data });
    return true;
  }
  if (frame.type === "error") {
    const data = frame.data as { message?: unknown } | null;
    if (
      typeof data?.message === "string" &&
      data.message.includes("unknown control type: chickenCommand")
    ) {
      commandCapability = false;
      rejectAll(commandError("SOCKET_COMMANDS_UNAVAILABLE", data.message, 503));
    }
    return true;
  }
  return frame.type === "pong" || frame.type === "authenticated" || frame.type === "unsubscribed";
}

function handleData(frame: ChickenGatewayFrame): void {
  if (frame.topic !== activeTopic) return;
  if (typeof frame.revision === "number") {
    if (lastRevision !== null && frame.revision <= lastRevision) return;
    if (lastRevision !== null && frame.revision > lastRevision + 1 && frame.snapshot !== true) {
      lastRevision = frame.revision;
      notify({ ...CHICKEN_SOCKET_RESYNC, topic: activeTopic, data: { reason: "revision_gap" } });
      return;
    }
    lastRevision = frame.revision;
  }
  if (
    frame.type === "chickenStarted" ||
    frame.type === "chickenStepped" ||
    frame.type === "chickenCashedOut"
  ) {
    notify(frame);
  }
}

async function open(): Promise<void> {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (opening) return opening;

  opening = (async () => {
    let accessToken: string | null;
    try {
      ({ accessToken } = await resolveAuthTokens());
    } catch {
      rejectAll(
        commandError("SOCKET_UNAVAILABLE", "The Chicken live connection is unavailable.", 503)
      );
      return;
    }
    if (!accessToken) {
      rejectAll(commandError("UNAUTHORIZED", "Sign in again to play Chicken.", 401));
      return;
    }
    activeAccessToken = accessToken;
    let connection: WebSocket;
    try {
      connection = new WebSocket(socketUrl(accessToken));
    } catch {
      rejectAll(
        commandError("SOCKET_UNAVAILABLE", "The Chicken live connection is unavailable.", 503)
      );
      return;
    }
    socket = connection;

    connection.onopen = () => {
      if (socket !== connection) return;
      send({ type: "authenticate", token: activeAccessToken });
      subscribe();
      sendPending();
      pingTimer = setInterval(() => send({ type: "ping", sentAt: Date.now() }), 25_000);
    };
    connection.onmessage = (event) => {
      if (socket !== connection) return;
      let frame: ChickenGatewayFrame;
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
      for (const command of [...pendingCommands.values()]) {
        if (command.sentAt === null) {
          rejectPending(
            command,
            commandError("SOCKET_UNAVAILABLE", "The Chicken live connection is unavailable.", 503)
          );
        }
      }
      notify(CHICKEN_SOCKET_CLOSED);
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

export function isChickenSession(value: unknown): value is ChickenSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ChickenSession>;
  return (
    typeof session.sessionId === "string" &&
    typeof session.version === "number" &&
    (session.status === "active" || session.status === "lost" || session.status === "cashed_out")
  );
}

export async function sendChickenCommand<T>(command: Record<string, unknown>): Promise<T> {
  const commandId = command.commandId;
  if (typeof commandId !== "string") {
    throw commandError("BAD_REQUEST", "A Chicken command ID is required.", 400);
  }
  const { accessToken, idToken } = await resolveAuthTokens();
  if (!accessToken || !idToken) {
    throw commandError("UNAUTHORIZED", "Sign in again to play Chicken.", 401);
  }
  if (commandCapability === false) {
    throw commandError(
      "SOCKET_COMMANDS_UNAVAILABLE",
      "This gateway does not support Chicken commands yet.",
      503
    );
  }

  const ackId = nextAckId;
  nextAckId = nextAckId >= Number.MAX_SAFE_INTEGER ? 1 : nextAckId + 1;
  return new Promise<T>((resolve, reject) => {
    const pending: PendingCommand = {
      ackId,
      commandId,
      frame: {
        type: "chickenCommand",
        ackId,
        auth: { accessToken, identityToken: idToken },
        command,
      },
      deadline: Date.now() + COMMAND_DEADLINE_MS,
      sentAt: null,
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
        pending.sentAt = Date.now();
      }
      scheduleRetry(pending);
    });
  });
}

export function subscribeChickenTopic(userId: string, listener: Listener): () => void {
  const topic = `arkjet:user:${userId}`;
  if (activeTopic && activeTopic !== topic) {
    send({ type: "unsubscribe", topics: [activeTopic] });
    lastRevision = null;
  }
  activeTopic = topic;
  listeners.add(listener);
  if (idleCloseTimer) clearTimeout(idleCloseTimer);
  idleCloseTimer = null;
  void open().then(() => {
    if (socket?.readyState === WebSocket.OPEN) subscribe();
  });

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      send({ type: "unsubscribe", topics: [topic] });
      activeTopic = null;
      lastRevision = null;
      scheduleIdleClose();
    }
  };
}
