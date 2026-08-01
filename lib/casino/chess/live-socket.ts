"use client";

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
// the only reliable attribution, since `position`/`gameOver` payloads have no id
// of their own. Connection-level control frames (welcome/subscribed/pong/error)
// are topic-less and ignored here.

const WS_URL = process.env.NEXT_PUBLIC_CHESS_WS_URL ?? "wss://ws.worldstreetwebservices.com";

export interface GatewayFrame {
  type?: string;
  topic?: string;
  data?: unknown;
}

// A synthetic frame the manager delivers when the socket drops, so subscribers
// can fall back to polling until it reconnects. It never comes from the gateway.
export const SOCKET_CLOSED_FRAME: GatewayFrame = { type: "__closed" };
// A synthetic frame delivered when the shared socket is open for subscriptions,
// so a board can treat the live path as warm before the next chess move lands.
export const SOCKET_OPEN_FRAME: GatewayFrame = { type: "__open" };

type Listener = (frame: GatewayFrame) => void;

// The gateway rate-limits new connections per IP (and one is shared with other
// services), so the socket is opened sparingly: it backs off on a drop that
// delivered nothing, and stays warm for a moment after the last unsubscribe so a
// remount or a quick navigation reuses it instead of reconnecting.
const IDLE_KEEPALIVE_MS = 8_000;

let socket: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let idleCloseTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2_000;

// topic → its listeners. The key set also drives what we (re)subscribe to on the
// wire, so an empty map means the socket has no reason to stay open.
const listeners = new Map<string, Set<Listener>>();

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

// Route a gateway frame to the subscribers of its topic. An untagged chess frame
// is tolerated during a rolling deploy: if only one match is being followed it
// can only be that one. Control frames (no topic) are dropped.
function deliver(frame: GatewayFrame): void {
  const topic = typeof frame.topic === "string" ? frame.topic : null;
  if (topic) {
    const set = listeners.get(topic);
    if (set) for (const listener of set) listener(frame);
    return;
  }
  const isChessFrame =
    frame.type === "state" || frame.type === "position" || frame.type === "gameOver";
  if (isChessFrame && listeners.size === 1) {
    for (const set of listeners.values()) for (const listener of set) listener(frame);
  }
}

// Notify every subscriber regardless of topic — used only for the synthetic
// close signal, which every board needs so it can fall back to polling.
function broadcastToAll(frame: GatewayFrame): void {
  for (const set of listeners.values()) {
    for (const listener of set) listener(frame);
  }
}

function open(): void {
  if (typeof window === "undefined") return;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    // A malformed URL throws synchronously; subscribers fall back to polling.
    socket = null;
    return;
  }
  socket.onopen = () => {
    const topics = [...listeners.keys()];
    if (topics.length > 0) send({ type: "subscribe", topics });
    pingTimer = setInterval(() => send({ type: "ping" }), 25_000);
    broadcastToAll(SOCKET_OPEN_FRAME);
  };
  socket.onmessage = (event) => {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
    }
    // Only a delivered game frame proves a healthy relay, so reset the backoff
    // here (not on open): a socket that connects but flaps without delivering
    // keeps backing off instead of reconnecting every couple of seconds.
    if (frame.type === "state" || frame.type === "position" || frame.type === "gameOver") {
      reconnectDelay = 2_000;
    }
    deliver(frame);
  };
  socket.onclose = () => {
    if (pingTimer != null) clearInterval(pingTimer);
    pingTimer = null;
    socket = null;
    // Tell subscribers the live path is gone so they speed their poll back up.
    broadcastToAll(SOCKET_CLOSED_FRAME);
    if (listeners.size > 0) scheduleReconnect();
  };
  socket.onerror = () => {};
}

function scheduleReconnect(): void {
  if (reconnectTimer != null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    open();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
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
  if (listeners.size > 0) return;
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
  try {
    closing?.close();
  } catch {
    // Already closing/closed; nothing to do.
  }
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

  // A new subscriber arrived — cancel any pending idle close and reuse the socket.
  if (idleCloseTimer != null) {
    clearTimeout(idleCloseTimer);
    idleCloseTimer = null;
  }
  open();
  // If the socket is already open, subscribe this new topic now; if it is still
  // connecting, onopen resubscribes every topic at once.
  if (isFirstForTopic) send({ type: "subscribe", topics: [topic] });
  if (socket?.readyState === WebSocket.OPEN) listener(SOCKET_OPEN_FRAME);

  return () => {
    const current = listeners.get(topic);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(topic);
      send({ type: "unsubscribe", topics: [topic] });
      scheduleIdleClose();
    }
  };
}
