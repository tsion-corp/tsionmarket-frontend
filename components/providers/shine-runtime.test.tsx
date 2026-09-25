import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import type { ShineService } from "@/lib/shine";

const post = vi.hoisted(() => vi.fn(async () => ({ id: "post-1" })));
vi.mock("@/lib/api/market-square", () => ({ createSquarePost: post }));

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

// `isOn` is what the switch draws and is ON while the record loads; `mayPost`
// is the decision. The provider must read the second one, so the stub keeps
// them deliberately opposed.
const shine = vi.hoisted(() => {
  const gate: { isOn: (service: string) => boolean; mayPost: (service: string) => boolean } = {
    isOn: () => true,
    mayPost: () => true,
  };
  return gate;
});
vi.mock("@/hooks/use-shine", () => ({
  useShine: () => ({ isOn: shine.isOn, mayPost: shine.mayPost }),
}));

import { ShineRuntimeProvider } from "@/components/providers/shine-runtime";
import {
  configureShine,
  entryPriceFromUsdString,
  reportShine,
  shineFailures,
  whenShineIdle,
  type EntryPrice,
  type ShineEvent,
} from "@/lib/shine";

function price(usd: string): EntryPrice {
  const parsed = entryPriceFromUsdString(usd);
  if (parsed === null) throw new Error(`test fixture price is unusable: ${usd}`);
  return parsed;
}

const PRICE = price("0.0000042");
const spotPrice = price("214.30");

function buy(id: string): ShineEvent {
  return { service: "memecoin", id, kind: "buy", symbol: "PEPE", price: PRICE };
}

function mount(locale: "en" | "fr") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}>
      <ShineRuntimeProvider />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  configureShine(null);
  session.userId = "did:privy:alice";
  shine.mayPost = () => true;
  shine.isOn = () => true;
  post.mockClear();
});

afterEach(() => {
  configureShine(null);
  vi.restoreAllMocks();
});

describe("installing the Shine runtime", () => {
  it("posts a reported event, which nothing did before it was mounted", async () => {
    reportShine(buy("swap-0"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
    expect(shineFailures().at(-1)?.code).toBe("SHINE_NOT_CONFIGURED");

    mount("en");
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(post).toHaveBeenCalledWith("Aped into $PEPE at $0.0000042.");
  });

  it("writes the post in the locale the app is being read in", async () => {
    mount("fr");
    reportShine(buy("swap-2"));
    await whenShineIdle();
    expect(post).toHaveBeenCalledWith("J’ai foncé sur $PEPE à $0.0000042.");
  });

  it("re-installs when the language changes under it", async () => {
    const view = mount("en");
    reportShine(buy("swap-7"));
    await whenShineIdle();
    expect(post).toHaveBeenLastCalledWith("Aped into $PEPE at $0.0000042.");

    view.rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <ShineRuntimeProvider />
      </NextIntlClientProvider>
    );
    reportShine(buy("swap-8"));
    await whenShineIdle();
    expect(post).toHaveBeenLastCalledWith("J’ai foncé sur $PEPE à $0.0000042.");
  });

  it("posts nothing while paused, whatever the preferences say", async () => {
    // The session providers pause it while an account upgrade is pending: a
    // post under an id whose old Square profile is not linked yet would make
    // the Square's placeholder profile somebody's account.
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ShineRuntimeProvider paused />
      </NextIntlClientProvider>
    );
    reportShine(buy("swap-9"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
  });

  it("gates on mayPost, not on what the switch is drawing", async () => {
    // The account's record has not arrived: the switch shows ON, and nothing
    // may be published on that.
    shine.mayPost = () => false;
    shine.isOn = () => true;
    mount("en");
    reportShine(buy("swap-3"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
  });

  it("asks the preference per service", async () => {
    shine.mayPost = (service: string) => (service as ShineService) !== "memecoin";
    mount("en");
    reportShine(buy("swap-4"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();

    reportShine({
      service: "spot",
      id: "req-1",
      kind: "buy",
      symbol: "SOL",
      price: spotPrice,
    });
    await whenShineIdle();
    expect(post).toHaveBeenCalledWith("Bought $SOL at $214.30 on spot.");
  });

  it("posts nothing once it is unmounted", async () => {
    const view = mount("en");
    view.unmount();
    reportShine(buy("swap-5"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
    expect(shineFailures().at(-1)?.code).toBe("SHINE_NOT_CONFIGURED");
  });

  it("posts nothing while there is no account to key the record by", async () => {
    session.userId = null;
    mount("en");
    reportShine(buy("swap-6"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
    expect(shineFailures().at(-1)?.code).toBe("SHINE_NO_ACCOUNT");
  });
});
