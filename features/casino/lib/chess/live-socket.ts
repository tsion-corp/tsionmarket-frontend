"use client";

import { apiError } from "@/lib/api/envelope";
import { resolveAuthTokens } from "@/lib/privy-token";

// One socket per client, shared across every chess board on screen.
//
// The WS gateway caps concurrent sockets per IP and drops a consumer whose
// outbound buffer falls too far behind, so the contract is explicit: open a
// single socket and multiplex the matches you watch as topics on it, never a
// socket per match. This module is that single socket — components subscribe to
// a match's liveTopic and get its frames, and the socket opens on the first
// subscription and closes when the last one goes away.
//
// Every data frame the gateway delivers carries a `topic` (the match's
// liveTopic), so each frame is routed to exactly the subscribers of that topic —
// the only reliable attribution, since not every chess frame carries its own
// match id. Connection-level control frames (welcome/subscribed/pong/error) are
// topic-less and ignored here.

const LOCAL_CHESS_WS_URL = "ws://127.0.0.1:8100";
// The gateway a deployment without NEXT_PUBLIC_CHESS_WS_URL falls back to. It
// is the live one: the staging host this used to name stopped accepting
// connections, and production reached for it before its own variable.
const DEPLOYED_CHESS_WS_URL = "wss://ws.tsionark.com";
// A variable set to nothing is a variable nobody set: it must not resolve to
// an empty address.
const NAMED_WS_URL = process.env.NEXT_PUBLIC_CHESS_WS_URL?.trim();
const WS_URL =
  NAMED_WS_URL !== undefined && NAMED_WS_URL !== ""
    ? NAMED_WS_URL
    : process.env.NODE_ENV === "production"
      ? DEPLOYED_CHESS_WS_URL
      : LOCAL_CHESS_WS_URL;

export interface GatewayFrame {
  type?: string;
  topic?: string;
  data?: unknown;
  revision?: number;
  timestamp?: number;
  snapshot?: boolean;
}

// A synthetic frame the manager delivers when the socket drops, so subscribers
// can fall back to polling until it reconnects. It never comes from the gateway.
export const SOCKET_CLOSED_FRAME: GatewayFrame = { type: "__closed" };
// Synthetic subscription signals. `ready` means the gateway accepted the
// topic; `resync` means replay could not close a revision gap and the caller
// must repair from its authoritative HTTP snapshot.
export const SOCKET_READY_FRAME: GatewayFrame = { type: "__ready" };
export const SOCKET_RESYNC_FRAME: GatewayFrame = { type: "__resync" };

type Listener = (frame: GatewayFrame) => void;

interface PendingRoundCommand {
  ackId: number;
  commandId: string;
  topic: string;
  frame: Record<string, unknown>;
  deadline: number;
  sentAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
}

// The gateway rate-limits new connections per IP (and one is shared with other
// services), so the socket is opened sparingly: it backs off on a drop that
// delivered nothing, and stays warm for a moment after the last unsubscribe so a
// remount or a quick navigation reuses it instead of reconnecting.
const IDLE_KEEPALIVE_MS = 8_000;
const COMMAND_RETRY_MS = 2_500;
const COMMAND_DEADLINE_MS = 15_000;

let socket: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let idleCloseTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2_000;
let recoveryListenersAttached = false;
let nextAckId = 1;
let chessCommandCapability: boolean | null = null;
let latestSocketLagMs: number | null = null;

// topic → its listeners. The key set also drives what we (re)subscribe to on the
// wire, so an empty map means the socket has no reason to stay open.
const listeners = new Map<string, Set<Listener>>();
const topicVersions = new Map<string, number>();
const subscribedTopics = new Set<string>();
const pendingCommands = new Map<number, PendingRoundCommand>();

function sendOn(connection: WebSocket | null, message: unknown): void {
  if (connection?.readyState === WebSocket.OPEN) connection.send(JSON.stringify(message));
}

function send(message: unknown): void {
  sendOn(socket, message);
}

function pendingCommandError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Error {
  return apiError(code, message, status, details);
}

function finishPending(command: PendingRoundCommand): void {
  if (command.timer != null) clearTimeout(command.timer);
  command.timer = null;
  pendingCommands.delete(command.ackId);
  if (listeners.size === 0 && pendingCommands.size === 0) scheduleIdleClose();
}

function rejectPending(command: PendingRoundCommand, error: Error): void {
  finishPending(command);
  command.reject(error);
}

function requestCommandResync(command: PendingRoundCommand, reason: string): void {
  notifyTopic(command.topic, { ...SOCKET_RESYNC_FRAME, topic: command.topic, data: { reason } });
}

function scheduleCommandRetry(command: PendingRoundCommand): void {
  if (!pendingCommands.has(command.ackId) || command.timer != null) return;
  const remaining = command.deadline - Date.now();
  command.timer = setTimeout(
    () => {
      command.timer = null;
      if (!pendingCommands.has(command.ackId)) return;
      if (Date.now() >= command.deadline) {
        requestCommandResync(command, "command_ack_timeout");
        rejectPending(
          command,
          pendingCommandError(
            "SOCKET_COMMAND_TIMEOUT",
            "The live game server did not acknowledge the command.",
            504
          )
        );
        return;
      }
      if (socket?.readyState === WebSocket.OPEN) {
        send(command.frame);
        command.sentAt = Date.now();
      } else if (command.sentAt === null) {
        rejectPending(
          command,
          pendingCommandError("SOCKET_UNAVAILABLE", "The live game connection is unavailable.", 503)
        );
        return;
      } else recoverConnection();
      scheduleCommandRetry(command);
    },
    Math.max(1, Math.min(COMMAND_RETRY_MS, remaining))
  );
}

function sendPendingCommands(): void {
  if (socket?.readyState !== WebSocket.OPEN || chessCommandCapability === false) return;
  for (const command of pendingCommands.values()) {
    send(command.frame);
    command.sentAt = Date.now();
    scheduleCommandRetry(command);
  }
}

function rejectAllPendingCommands(error: Error): void {
  for (const command of [...pendingCommands.values()]) rejectPending(command, error);
}

function versionsFor(topics: string[]): Record<string, number> {
  return Object.fromEntries(
    topics.flatMap((topic) => {
      const revision = topicVersions.get(topic);
      return revision === undefined ? [] : [[topic, revision] as const];
    })
  );
}

function subscribeMessage(topics: string[]): Record<string, unknown> {
  return { type: "subscribe", topics, versions: versionsFor(topics) };
}

function requestSocketSnapshots(connection: WebSocket): void {
  const topics = [...subscribedTopics];
  if (topics.length > 0) sendOn(connection, { type: "snapshot", topics });
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export type ChessFrameRevisionDecision = "deliver" | "ignore" | "resync";

export function chessFrameRevisionDecision(
  previous: number | undefined,
  incoming: number | undefined,
  snapshot = false
): ChessFrameRevisionDecision {
  if (!isRevision(incoming) || previous === undefined) return "deliver";
  if (incoming <= previous) return "ignore";
  if (snapshot || incoming === previous + 1) return "deliver";
  return "resync";
}

function isLiveDataFrame(type: string | undefined): boolean {
  return (
    type === "state" ||
    type === "position" ||
    type === "gameOver" ||
    type === "chatLine" ||
    type === "commentUpserted" ||
    type === "commentDeleted" ||
    type === "rematchOffer" ||
    type === "rematchTaken" ||
    type === "takebackOffers" ||
    type === "coachReview" ||
    type === "coachContinued" ||
    type === "coachUndone" ||
    type === "coachHint" ||
    type === "coachSummary"
  );
}

function notifyTopic(topic: string, frame: GatewayFrame): void {
  const set = listeners.get(topic);
  if (set) for (const listener of set) listener(frame);
}

// Route a data frame after enforcing the gateway's monotonic topic revision.
// Old/duplicate frames are ignored. A gap is never guessed through: the caller
// receives `__resync` and repairs from the authoritative round snapshot.
function deliverForTopic(topic: string, frame: GatewayFrame): void {
  const previous = topicVersions.get(topic);
  const decision = chessFrameRevisionDecision(previous, frame.revision, frame.snapshot === true);
  if (decision === "ignore") return;
  if (isRevision(frame.revision)) topicVersions.set(topic, frame.revision);
  if (decision === "resync") {
    notifyTopic(topic, { ...SOCKET_RESYNC_FRAME, topic, data: { reason: "revision_gap" } });
    return;
  }
  notifyTopic(topic, frame);
}

// Untagged live frames are tolerated during a rolling gateway deployment when
// only one topic is followed. Control frames are handled separately.
function deliver(frame: GatewayFrame): void {
  if (typeof frame.topic === "string") {
    deliverForTopic(frame.topic, frame);
    return;
  }
  if (!isLiveDataFrame(frame.type)) return;
  if (listeners.size === 1) {
    const topic = listeners.keys().next().value as string | undefined;
    if (topic) deliverForTopic(topic, { ...frame, topic });
  }
}

// Notify every subscriber regardless of topic — used only for the synthetic
// close signal, which every board needs so it can fall back to polling.
function broadcastToAll(frame: GatewayFrame): void {
  for (const set of listeners.values()) {
    for (const listener of set) listener(frame);
  }
}

function controlTopics(data: unknown): string[] {
  if (!data || typeof data !== "object" || !("topics" in data)) return [];
  const topics = (data as { topics?: unknown }).topics;
  return Array.isArray(topics)
    ? topics.filter((topic): topic is string => typeof topic === "string")
    : [];
}

function handleControl(frame: GatewayFrame): boolean {
  if (frame.type === "welcome") {
    const data = frame.data as {
      capabilities?: { chessRoundCommands?: unknown };
    } | null;
    const capability = data?.capabilities?.chessRoundCommands;
    chessCommandCapability = typeof capability === "boolean" ? capability : null;
    if (chessCommandCapability === false) {
      rejectAllPendingCommands(
        pendingCommandError(
          "SOCKET_COMMANDS_UNAVAILABLE",
          "This gateway does not support live chess commands yet.",
          503
        )
      );
    }
    return true;
  }
  if (frame.type === "roundCommandAck") {
    const data = frame.data as { ackId?: unknown; response?: unknown } | null;
    if (typeof data?.ackId !== "number") return true;
    const command = pendingCommands.get(data.ackId);
    if (!command) return true;
    finishPending(command);
    command.resolve(data.response);
    return true;
  }
  if (frame.type === "roundCommandError") {
    const data = frame.data as {
      ackId?: unknown;
      status?: unknown;
      code?: unknown;
      message?: unknown;
      retryable?: unknown;
    } | null;
    const ackId = typeof data?.ackId === "number" ? data.ackId : null;
    const command = ackId === null ? null : pendingCommands.get(ackId);
    if (!command) return true;
    const status = typeof data?.status === "number" ? data.status : 500;
    const code = typeof data?.code === "string" ? data.code : "CHESS_COMMAND_FAILED";
    const message =
      typeof data?.message === "string" ? data.message : "Chess could not apply that command.";
    if (data?.retryable === true && code !== "SOCKET_COMMANDS_UNAVAILABLE") {
      scheduleCommandRetry(command);
      return true;
    }
    rejectPending(command, pendingCommandError(code, message, status, data));
    return true;
  }
  if (frame.type === "pong") {
    const data = frame.data as { sentAt?: unknown } | null;
    if (typeof data?.sentAt === "number" && Number.isFinite(data.sentAt)) {
      latestSocketLagMs = Math.max(0, Math.min(120_000, Date.now() - data.sentAt));
    }
    return true;
  }
  if (frame.type === "error") {
    const data = frame.data as { message?: unknown } | null;
    if (
      typeof data?.message === "string" &&
      data.message.includes("unknown control type: roundCommand")
    ) {
      chessCommandCapability = false;
      rejectAllPendingCommands(
        pendingCommandError("SOCKET_COMMANDS_UNAVAILABLE", data.message, 503)
      );
    }
    return true;
  }
  if (frame.type === "subscribed") {
    reconnectDelay = 2_000;
    for (const topic of controlTopics(frame.data)) {
      subscribedTopics.add(topic);
      notifyTopic(topic, { ...SOCKET_READY_FRAME, topic });
    }
    return true;
  }
  if (frame.type === "resync") {
    const data = frame.data as { topic?: unknown; latestRevision?: unknown } | null;
    const topic = typeof data?.topic === "string" ? data.topic : null;
    if (!topic) return true;
    if (isRevision(data?.latestRevision)) {
      topicVersions.set(topic, Math.max(topicVersions.get(topic) ?? 0, data.latestRevision));
    }
    notifyTopic(topic, { ...SOCKET_RESYNC_FRAME, topic, data: frame.data });
    return true;
  }
  return frame.type === "unsubscribed" || frame.type === "authenticated";
}

function open(): void {
  if (typeof window === "undefined" || (listeners.size === 0 && pendingCommands.size === 0)) return;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  let connection: WebSocket;
  try {
    connection = new WebSocket(WS_URL);
    socket = connection;
  } catch {
    // A malformed URL throws synchronously; subscribers fall back to polling.
    socket = null;
    return;
  }
  connection.onopen = () => {
    if (socket !== connection) return;
    const topics = [...listeners.keys()];
    if (topics.length > 0) sendOn(connection, subscribeMessage(topics));
    sendPendingCommands();
    sendOn(connection, { type: "ping", sentAt: Date.now() });
    pingTimer = setInterval(() => {
      sendOn(connection, { type: "ping", sentAt: Date.now() });
      requestSocketSnapshots(connection);
    }, 25_000);
  };
  connection.onmessage = (event) => {
    if (socket !== connection) return;
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (handleControl(frame)) return;
    // Only a delivered game frame proves a healthy relay, so reset the backoff
    // here (not on open): a socket that connects but flaps without delivering
    // keeps backing off instead of reconnecting every couple of seconds.
    if (isLiveDataFrame(frame.type)) {
      reconnectDelay = 2_000;
    }
    deliver(frame);
  };
  connection.onclose = () => {
    if (socket !== connection) return;
    if (pingTimer != null) clearInterval(pingTimer);
    pingTimer = null;
    socket = null;
    chessCommandCapability = null;
    latestSocketLagMs = null;
    subscribedTopics.clear();
    // Tell subscribers the live path is gone so they speed their poll back up.
    broadcastToAll(SOCKET_CLOSED_FRAME);
    if (listeners.size > 0 || pendingCommands.size > 0) scheduleReconnect();
  };
  connection.onerror = () => {};
}

function scheduleReconnect(): void {
  if (reconnectTimer != null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    open();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
}

function recoverConnection(): void {
  if (listeners.size === 0 && pendingCommands.size === 0) return;
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket?.readyState === WebSocket.OPEN) {
    send({ type: "ping", sentAt: Date.now() });
    return;
  }
  if (socket?.readyState === WebSocket.CONNECTING) {
    const stale = socket;
    socket = null;
    try {
      stale.close();
    } catch {
      // A browser can report CONNECTING while already tearing the socket down.
    }
  }
  open();
}

function onVisibilityRecovery(): void {
  if (document.visibilityState === "visible") recoverConnection();
}

function attachRecoveryListeners(): void {
  if (recoveryListenersAttached || typeof window === "undefined") return;
  recoveryListenersAttached = true;
  window.addEventListener("online", recoverConnection);
  document.addEventListener("visibilitychange", onVisibilityRecovery);
}

function detachRecoveryListeners(): void {
  if (!recoveryListenersAttached || typeof window === "undefined") return;
  recoveryListenersAttached = false;
  window.removeEventListener("online", recoverConnection);
  document.removeEventListener("visibilitychange", onVisibilityRecovery);
}

// Close the socket a short while after the last unsubscribe, so a remount (React
// StrictMode, or navigating between two boards) reuses the warm socket instead
// of spending one of the per-IP connection budget on an immediate reconnect.
function scheduleIdleClose(): void {
  if (idleCloseTimer != null) return;
  idleCloseTimer = setTimeout(() => {
    idleCloseTimer = null;
    closeIfIdle();
  }, IDLE_KEEPALIVE_MS);
}

function closeIfIdle(): void {
  if (listeners.size > 0 || pendingCommands.size > 0) return;
  detachRecoveryListeners();
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer != null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  const closing = socket;
  socket = null;
  chessCommandCapability = null;
  latestSocketLagMs = null;
  subscribedTopics.clear();
  try {
    if (closing) {
      closing.onopen = null;
      closing.onmessage = null;
      closing.onclose = null;
      closing.onerror = null;
      closing.close();
    }
  } catch {
    // Already closing/closed; nothing to do.
  }
}

/**
 * Sends one idempotent round command over the shared socket. The same ack and
 * command IDs survive reconnects and timed resends; Chess deduplicates the
 * command durably before returning the authoritative response.
 */
export async function sendChessRoundCommand<T>(command: Record<string, unknown>): Promise<T> {
  if (typeof window === "undefined") {
    throw pendingCommandError("SOCKET_UNAVAILABLE", "Live chess is browser-only.", 503);
  }
  const commandId = command.commandId;
  const matchId = command.matchId;
  if (typeof commandId !== "string" || typeof matchId !== "string") {
    throw pendingCommandError("BAD_REQUEST", "A round command and match ID are required.", 400);
  }
  const { accessToken, idToken } = await resolveAuthTokens();
  if (!accessToken || !idToken) {
    throw pendingCommandError("UNAUTHORIZED", "Sign in again to continue the game.", 401);
  }
  if (chessCommandCapability === false) {
    throw pendingCommandError(
      "SOCKET_COMMANDS_UNAVAILABLE",
      "This gateway does not support live chess commands yet.",
      503
    );
  }

  const ackId = nextAckId;
  nextAckId = nextAckId >= Number.MAX_SAFE_INTEGER ? 1 : nextAckId + 1;
  const topic = `chess:match:${matchId}`;
  const socketCommand =
    latestSocketLagMs === null || typeof command.clientLagMs === "number"
      ? command
      : { ...command, clientLagMs: latestSocketLagMs };

  return new Promise<T>((resolve, reject) => {
    const pending: PendingRoundCommand = {
      ackId,
      commandId,
      topic,
      frame: {
        type: "roundCommand",
        ackId,
        auth: { accessToken, identityToken: idToken },
        command: socketCommand,
      },
      deadline: Date.now() + COMMAND_DEADLINE_MS,
      sentAt: null,
      timer: null,
      resolve: (response) => resolve(response as T),
      reject,
    };
    pendingCommands.set(ackId, pending);
    attachRecoveryListeners();
    if (idleCloseTimer != null) {
      clearTimeout(idleCloseTimer);
      idleCloseTimer = null;
    }
    open();
    if (socket?.readyState === WebSocket.OPEN) {
      send(pending.frame);
      pending.sentAt = Date.now();
    }
    scheduleCommandRetry(pending);
  });
}

// Subscribe to a match's live topic. Returns an unsubscribe function that must be
// called on cleanup; the socket closes once no topics remain.
export function subscribeChessTopic(topic: string, listener: Listener): () => void {
  let set = listeners.get(topic);
  const isFirstForTopic = !set;
  if (!set) {
    set = new Set();
    listeners.set(topic, set);
  }
  set.add(listener);
  attachRecoveryListeners();

  // A new subscriber arrived — cancel any pending idle close and reuse the socket.
  if (idleCloseTimer != null) {
    clearTimeout(idleCloseTimer);
    idleCloseTimer = null;
  }
  open();
  // If the socket is already open, subscribe this new topic now; if it is still
  // connecting, onopen resubscribes every topic at once.
  if (isFirstForTopic) send(subscribeMessage([topic]));
  if (subscribedTopics.has(topic)) listener({ ...SOCKET_READY_FRAME, topic });

  return () => {
    const current = listeners.get(topic);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(topic);
      topicVersions.delete(topic);
      subscribedTopics.delete(topic);
      send({ type: "unsubscribe", topics: [topic] });
      scheduleIdleClose();
    }
  };
}
