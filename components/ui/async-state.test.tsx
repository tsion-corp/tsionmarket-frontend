import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AsyncError } from "./async-state";

const circuit = vi.hoisted(() => ({
  state: "closed" as "closed" | "open",
  retryAt: 0,
  failures: 0,
}));
vi.mock("@/lib/api/circuit-store", () => ({ useCircuit: () => circuit }));

function renderError(error: unknown, onRetry?: () => void) {
  circuit.state = "closed";
  return render(<AsyncError error={error} subject="the lobby" onRetry={onRetry} />);
}

describe("AsyncError", () => {
  /**
   * The bug this closes: the panel printed `error.message`, so a reader whose
   * wifi blinked was shown "Failed to fetch" — text written for whoever reads
   * the logs, naming something they cannot act on.
   */
  it("never shows the exception to the reader", () => {
    renderError(new Error("HTTP 502 upstream boom"));
    expect(screen.queryByText(/HTTP 502/)).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load the lobby.")).toBeInTheDocument();
  });

  it("keeps the real message reachable for whoever is debugging", () => {
    renderError(new Error("HTTP 502 upstream boom"));
    expect(screen.getByTitle("HTTP 502 upstream boom")).toBeInTheDocument();
  });

  // The connection bar is already announcing the outage and already retrying.
  // The panel says the calm half of that and offers no button of its own —
  // five panels each offering a retry is how a reader multiplies the load.
  it("stands down while the app is already retrying", () => {
    circuit.state = "open";
    render(<AsyncError error={new Error("nope")} subject="the lobby" onRetry={() => {}} />);
    expect(screen.getByText("Waiting to reach the server.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers a retry when one could actually achieve something", () => {
    renderError(new Error("nope"), () => {});
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  // Nothing the reader taps switches a service on.
  it("never offers to retry a service that is not deployed", () => {
    renderError({ code: "NOT_CONFIGURED" }, () => {});
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
