import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  userId: "did:privy:alice" as string | null,
  evmAddress: null as string | null,
  solanaAddress: null as string | null,
  profile: { name: "u", email: "", avatarSeed: "u" },
  logout: async () => {},
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));

import { ShineToggle } from "@/components/shine/shine-toggle";

const ALL_ON = {
  memecoin: true,
  spot: true,
  rwa: true,
  prediction: true,
  perps: true,
  arcade: true,
  sports: true,
};

function answer(shine: Partial<typeof ALL_ON> = {}) {
  return new Response(JSON.stringify({ shine: { ...ALL_ON, ...shine } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function refusal() {
  return new Response(JSON.stringify({ error: "nope" }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function renderToggle(service: keyof typeof ALL_ON = "perps") {
  return render(<ShineToggle service={service} />, { wrapper: Providers });
}

const theSwitch = () => screen.getByRole("switch");

// The primitive is a Base UI switch, which is a span carrying role="switch"
// and aria-disabled rather than a native input. `toBeEnabled` is meaningless
// on it — it passes on any span — so readiness is waited for on the attribute
// the primitive actually sets.
async function settled() {
  await waitFor(() => expect(theSwitch()).not.toHaveAttribute("aria-disabled"));
}

describe("ShineToggle", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    session.userId = "did:privy:alice";
  });
  afterEach(() => client.clear());

  it("is a real switch, named, with its state announced", async () => {
    apiFetch.mockResolvedValue(answer());
    renderToggle();
    await settled();
    expect(theSwitch()).toHaveAccessibleName(/shine/i);
    expect(theSwitch()).toBeChecked();
  });

  it("shows the word Shine", async () => {
    apiFetch.mockResolvedValue(answer());
    renderToggle();
    expect(await screen.findByText("Shine")).toBeInTheDocument();
  });

  it("draws a service the account turned off as off", async () => {
    apiFetch.mockResolvedValue(answer({ perps: false }));
    renderToggle("perps");
    await waitFor(() => expect(theSwitch()).not.toBeChecked());
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("reads only its own service", async () => {
    apiFetch.mockResolvedValue(answer({ perps: false }));
    renderToggle("spot");
    await settled();
    expect(theSwitch()).toBeChecked();
    expect(screen.getByText("On")).toBeInTheDocument();
  });

  // The copy has to say that turning it off is not a retraction, because a
  // user who finds that out afterwards has a legitimate complaint.
  it("says that turning Shine off leaves posts already made in the Square", async () => {
    apiFetch.mockResolvedValue(answer());
    renderToggle();
    expect(
      await screen.findByText(
        "Turning Shine off stops new posts. Anything already posted stays in the Square."
      )
    ).toBeInTheDocument();
  });

  it("says what is posted, and that amounts are not", async () => {
    apiFetch.mockResolvedValue(answer());
    renderToggle();
    expect(
      await screen.findByText(
        "When Shine is on, each thing you do here is posted to Market Square by itself. Posts never include your amounts or balances."
      )
    ).toBeInTheDocument();
  });

  // The switch's own name carries the visible word, and the copy beside it is
  // its description, so a screen reader hears the caveat too.
  it("describes the switch with the copy that sits beside it", async () => {
    apiFetch.mockResolvedValue(answer());
    renderToggle();
    await settled();
    expect(theSwitch()).toHaveAccessibleDescription(/never include your amounts/i);
    expect(theSwitch()).toHaveAccessibleDescription(/already posted stays in the Square/i);
  });

  it("flips off and saves that service", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    renderToggle("arcade");
    await settled();

    apiFetch.mockResolvedValueOnce(answer({ arcade: false }));
    fireEvent.click(theSwitch());

    await waitFor(() => expect(theSwitch()).not.toBeChecked());
    expect(apiFetch).toHaveBeenCalledTimes(2);
    const [path, init] = apiFetch.mock.calls[1] as [string, RequestInit];
    expect(path).toBe("/api/preferences");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ shine: { arcade: false } });
  });

  it("flips back on again", async () => {
    apiFetch.mockResolvedValueOnce(answer({ sports: false }));
    renderToggle("sports");
    await waitFor(() => expect(theSwitch()).not.toBeChecked());
    await settled();

    apiFetch.mockResolvedValueOnce(answer());
    fireEvent.click(theSwitch());

    await waitFor(() => expect(theSwitch()).toBeChecked());
    const [, init] = apiFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ shine: { sports: true } });
  });

  it("is operable from the keyboard", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    renderToggle("rwa");
    await settled();
    expect(theSwitch()).toHaveAttribute("tabindex", "0");

    apiFetch.mockResolvedValueOnce(answer({ rwa: false }));
    theSwitch().focus();
    expect(theSwitch()).toHaveFocus();
    fireEvent.keyDown(theSwitch(), { key: " " });
    fireEvent.keyUp(theSwitch(), { key: " " });

    await waitFor(() => expect(theSwitch()).not.toBeChecked());
    expect(JSON.parse(String((apiFetch.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
      shine: { rwa: false },
    });
  });

  // A save that fails silently would leave the person believing a decision
  // about their privacy was recorded when it was not.
  it("says so, and goes back, when the save fails", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    renderToggle("memecoin");
    await settled();

    apiFetch.mockResolvedValueOnce(refusal());
    fireEvent.click(theSwitch());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t save that. Check your connection and try again."
    );
    await waitFor(() => expect(theSwitch()).toBeChecked());
  });

  it("clears the failure once a save goes through", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    renderToggle("spot");
    await settled();

    apiFetch.mockResolvedValueOnce(refusal());
    fireEvent.click(theSwitch());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await settled();

    apiFetch.mockResolvedValueOnce(answer({ spot: false }));
    fireEvent.click(theSwitch());
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(theSwitch()).not.toBeChecked();
  });

  // Nothing settled yet, so the control is not presented as a settled value,
  // and a flip cannot be recorded against a record that has not arrived.
  it("does not accept a flip before the account's record has arrived", async () => {
    apiFetch.mockReturnValue(new Promise<Response>(() => {}));
    renderToggle();
    expect(theSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(theSwitch()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Checking…")).toBeInTheDocument();

    fireEvent.click(theSwitch());
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(theSwitch()).toBeChecked();
  });

  it("says so, and offers a retry, when the record cannot be read at all", async () => {
    apiFetch.mockResolvedValueOnce(refusal());
    renderToggle();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load your Shine setting.");
    expect(theSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("Checking…")).toBeNull();

    apiFetch.mockResolvedValueOnce(answer());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks nobody to flip a setting they have no account to save it on", async () => {
    session.userId = null;
    renderToggle();
    expect(theSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Sign in to change this.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
