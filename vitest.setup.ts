import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom ships no WebSocket, so Node's undici implementation gets picked up and
// the chess live socket dials the real gateway during component tests. Its
// Event objects come from a different realm than jsdom's, and dispatching one
// throws ERR_INVALID_ARG_TYPE as an uncaught exception — which fails the run
// even when every test passes, and only once a connection actually completes,
// so it turns on network speed. No test needs a live socket, so a stub that
// never connects keeps the suite hermetic.
class InertWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly readyState = InertWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(): void {}
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

globalThis.WebSocket = InertWebSocket as unknown as typeof WebSocket;

afterEach(() => {
  cleanup();
});
