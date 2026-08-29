import { describe, expect, it } from "vitest";
import {
  CLOSED,
  DEFAULT_CIRCUIT,
  allowsRequest,
  isCircuitFailure,
  onFailure,
  onProbe,
  onSuccess,
} from "@/lib/api/circuit";

const T = 1_000_000;

describe("isCircuitFailure", () => {
  // Narrow on purpose: tripping on a 401 or a 404 would take the whole app
  // down over one bad request, which is the opposite of the point.
  it("counts transport failures and 5xx, nothing else", () => {
    expect(isCircuitFailure(undefined)).toBe(true);
    expect(isCircuitFailure(500)).toBe(true);
    expect(isCircuitFailure(502)).toBe(true);
    expect(isCircuitFailure(504)).toBe(true);
    expect(isCircuitFailure(401)).toBe(false);
    expect(isCircuitFailure(404)).toBe(false);
    expect(isCircuitFailure(429)).toBe(false);
    expect(isCircuitFailure(200)).toBe(false);
  });
});

describe("opening", () => {
  it("tolerates failures below the threshold — one 502 is not an outage", () => {
    let circuit = onFailure(CLOSED, T);
    expect(circuit.state).toBe("closed");
    circuit = onFailure(circuit, T);
    expect(circuit.state).toBe("closed");
    expect(allowsRequest(circuit, T)).toBe(true);
  });

  it("opens on the third consecutive failure and blocks immediately", () => {
    let circuit = CLOSED;
    for (let i = 0; i < DEFAULT_CIRCUIT.threshold; i += 1) circuit = onFailure(circuit, T);
    expect(circuit.state).toBe("open");
    expect(allowsRequest(circuit, T)).toBe(false);
    expect(circuit.retryAt).toBe(T + DEFAULT_CIRCUIT.cooldownMs);
  });

  it("lets exactly one probe through once the cooldown elapses", () => {
    let circuit = CLOSED;
    for (let i = 0; i < 3; i += 1) circuit = onFailure(circuit, T);
    expect(allowsRequest(circuit, circuit.retryAt - 1)).toBe(false);
    expect(allowsRequest(circuit, circuit.retryAt)).toBe(true);
    expect(onProbe(circuit).state).toBe("half-open");
  });

  // A backend that has been down for ten minutes does not need asking every
  // fifteen seconds — and that asking is the cost we are here to remove.
  it("backs the probe off, to a ceiling", () => {
    let circuit = CLOSED;
    for (let i = 0; i < 3; i += 1) circuit = onFailure(circuit, T);
    const first = circuit.retryAt - T;
    circuit = onFailure(circuit, T);
    const second = circuit.retryAt - T;
    expect(second).toBe(first * 2);
    for (let i = 0; i < 12; i += 1) circuit = onFailure(circuit, T);
    expect(circuit.retryAt - T).toBe(DEFAULT_CIRCUIT.maxCooldownMs);
  });
});

describe("closing", () => {
  it("one success clears everything", () => {
    let circuit = CLOSED;
    for (let i = 0; i < 5; i += 1) circuit = onFailure(circuit, T);
    const recovered = onSuccess();
    expect(recovered).toEqual(CLOSED);
    expect(allowsRequest(recovered, T)).toBe(true);
  });
});
