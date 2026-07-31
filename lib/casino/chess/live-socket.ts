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

type Listener = (frame: GatewayFrame) => void;

let socket: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    reconnectDelay = 2_000;
    const topics = [...listeners.keys()];
    if (topics.length > 0) send({ type: "subscribe", topics });
    pingTimer = setInterval(() => send({ type: "ping" }), 25_000);
  };
  socket.onmessage = (event) => {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
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

  open();
  // If the socket is already open, subscribe this new topic now; if it is still
  // connecting, onopen resubscribes every topic at once.
  if (isFirstForTopic) send({ type: "subscribe", topics: [topic] });

  return () => {
    const current = listeners.get(topic);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(topic);
      send({ type: "unsubscribe", topics: [topic] });
      closeIfIdle();
    }
  };
}
