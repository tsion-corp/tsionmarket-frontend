import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));
const fundedFriend = vi.hoisted(() => ({
  create: vi.fn(),
  accept: vi.fn(),
  fundEntry: vi.fn(),
}));
const fundedComputer = vi.hoisted(() => ({
  start: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  logout: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@privy-io/react-auth", () => ({
  getAccessToken: vi.fn(() => Promise.resolve("access-token")),
  getIdentityToken: vi.fn(() => Promise.resolve("identity-token")),
}));

// The frame reads the session through the app's Decane-backed seam.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: null,
    solanaAddress: null,
    profile: { name: "Player", email: "", avatarSeed: "seed" },
    logout: auth.logout,
  }),
}));

vi.mock("@/components/auth/auth-guard", () => ({
  AuthGuard: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/features/casino/components/chess-app/chess-profile-balance", () => ({
  ChessProfileBalance: () => <output>Profile balance</output>,
}));

vi.mock("@/features/casino/hooks/use-funded-chess-computer", () => ({
  useFundedChessComputer: () => ({
    start: fundedComputer.start,
    availableUsdc: "0",
    balanceLoading: false,
  }),
}));

vi.mock("@/features/casino/hooks/use-casino-wallet", () => ({
  useCasinoWallet: () => ({ address: "0xtest" }),
}));

vi.mock("@/features/casino/hooks/use-funded-chess-challenge", () => ({
  friendTimeControl: (value: string) => {
    const [seconds, increment] = value.split("+");
    return `${Number(seconds) / 60}+${increment}`;
  },
  useFundedChessChallenge: () => ({
    create: fundedFriend.create,
    accept: fundedFriend.accept,
    fundEntry: fundedFriend.fundEntry,
    availableUsdc: "25",
    balanceLoading: false,
    configured: true,
  }),
}));

import {
  ChessLobbyFrame,
  chessAppRouteForUrl,
  chessFrameSourceForAppRoute,
  chessParentRouteForFrameUrl,
  chessRouteForLifecycleSnapshot,
  installChessVariantPickers,
  normalizeChessLobbyLayout,
  rewriteChessFrameLinks,
} from "@/features/casino/components/chess-app/chess-lobby-frame";

describe("ChessLobbyFrame", () => {
  beforeEach(() => {
    navigation.push.mockClear();
    navigation.replace.mockClear();
    fundedFriend.create.mockReset();
    fundedFriend.accept.mockReset();
    fundedFriend.fundEntry.mockReset();
    fundedComputer.start.mockReset();
    auth.logout.mockClear();
  });

  it("loads the Lichess page through the application's shared auth guard", () => {
    render(<ChessLobbyFrame source="/api/chess/play" />);

    expect(screen.getByTitle("Ark Chess")).toHaveAttribute("src", "/api/chess/play");
  });

  it("stays inside the shared dashboard chrome instead of covering the viewport", () => {
    render(<ChessLobbyFrame source="/api/chess/play" />);

    const frame = screen.getByTitle("Ark Chess");
    expect(frame).not.toHaveClass("fixed", "inset-0");
    expect(frame).toHaveClass("w-full");
  });

  it("groups legacy lobby tournaments and game actions into one right rail", () => {
    const frameDocument = document.implementation.createHTMLDocument("Ark Chess");
    frameDocument.body.innerHTML = `
      <main class="lobby">
        <div class="lobby__side">Tournaments</div>
        <div class="lobby__app">Boards</div>
        <div class="lobby__table">Game actions</div>
      </main>
    `;

    normalizeChessLobbyLayout(frameDocument);
    normalizeChessLobbyLayout(frameDocument);

    const rail = frameDocument.querySelector(".lobby__rail");
    expect(frameDocument.querySelectorAll(".lobby__rail")).toHaveLength(1);
    expect(rail?.children).toHaveLength(2);
    expect(rail?.firstElementChild?.classList.contains("lobby__side")).toBe(true);
    expect(rail?.lastElementChild?.classList.contains("lobby__table")).toBe(true);
  });

  it("applies variant picker choices to the submitted game state", () => {
    const frameDocument = document.implementation.createHTMLDocument("Ark Chess");
    frameDocument.body.innerHTML = `
      <form data-computer-setup>
        <input name="variant" value="standard">
        <div class="mselect">
          <input class="mselect__toggle" type="checkbox">
          <label class="mselect__label">
            <span class="icon" data-icon="standard"></span>
            <span class="name">Standard</span>
            <span class="desc">Standard rules</span>
          </label>
          <div class="mselect__list">
            <div class="mselect__item current" data-variant="standard" data-icon="standard">
              <span class="name">Standard</span><span class="desc">Standard rules</span>
            </div>
            <div class="mselect__item" data-variant="chess960" data-icon="960">
              <span class="name">Chess960</span><span class="desc">Random home rank</span>
            </div>
            <div class="mselect__item" data-variant="fromPosition" data-icon="fen">
              <span class="name">From Position</span><span class="desc">Custom FEN</span>
            </div>
          </div>
        </div>
        <div class="from-position-fields" hidden></div>
      </form>
    `;

    const detach = installChessVariantPickers(frameDocument);
    const picker = frameDocument.querySelector<HTMLElement>(".mselect")!;
    const toggle = frameDocument.querySelector<HTMLInputElement>(".mselect__toggle")!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    expect(picker.classList.contains("mselect__active")).toBe(true);

    frameDocument
      .querySelector('[data-variant="chess960"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(frameDocument.querySelector<HTMLInputElement>('input[name="variant"]')?.value).toBe(
      "chess960"
    );
    expect(frameDocument.querySelector(".mselect__label .name")?.textContent).toBe("Chess960");
    expect(picker.classList.contains("mselect__active")).toBe(false);

    frameDocument
      .querySelector('[data-variant="fromPosition"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    expect(frameDocument.querySelector<HTMLInputElement>('input[name="variant"]')?.value).toBe(
      "fromPosition"
    );
    expect(frameDocument.querySelector<HTMLElement>(".from-position-fields")?.hidden).toBe(false);
    detach();
  });

  it("keeps rated matchmaking on Standard and switches variants to Casual", () => {
    const frameDocument = document.implementation.createHTMLDocument("Ark Chess");
    frameDocument.body.innerHTML = `
      <form data-lobby-setup>
        <input name="variant" value="standard">
        <input id="rated" name="mode" value="rated" type="radio" checked>
        <label for="rated">Rated</label>
        <input id="casual" name="mode" value="casual" type="radio">
        <label for="casual">Casual</label>
        <p data-rated-variant-note hidden>Variants are Casual.</p>
        <div class="mselect">
          <input class="mselect__toggle" type="checkbox">
          <label class="mselect__label">
            <span class="icon" data-icon="standard"></span>
            <span class="name">Standard</span>
            <span class="desc">Standard rules</span>
          </label>
          <div class="mselect__list">
            <div class="mselect__item current" data-variant="standard" data-icon="standard">
              <span class="name">Standard</span><span class="desc">Standard rules</span>
            </div>
            <div class="mselect__item" data-variant="atomic" data-icon="atomic">
              <span class="name">Atomic</span><span class="desc">Exploding captures</span>
            </div>
          </div>
        </div>
      </form>
    `;

    const detach = installChessVariantPickers(frameDocument);
    const rated = frameDocument.querySelector<HTMLInputElement>("#rated")!;
    const casual = frameDocument.querySelector<HTMLInputElement>("#casual")!;
    const note = frameDocument.querySelector<HTMLElement>("[data-rated-variant-note]")!;

    frameDocument
      .querySelector('[data-variant="atomic"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(rated.disabled).toBe(true);
    expect(casual.checked).toBe(true);
    expect(note.hidden).toBe(false);

    frameDocument
      .querySelector('[data-variant="standard"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(rated.disabled).toBe(false);
    expect(note.hidden).toBe(true);
    detach();
  });

  it("creates funded lobby fallback games without a clock at maximum public strength", async () => {
    fundedComputer.start.mockResolvedValue({ id: "funded-lobby" });
    render(<ChessLobbyFrame source="/api/chess/play?setup=hook" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(`<body>
      <form data-lobby-setup>
        <select name="time_control"><option value="300+3" selected>5+3</option></select>
        <input name="color" value="white" checked type="radio">
        <input name="stake_usdc" value="5">
        <p data-lobby-stake-error hidden></p>
        <button type="submit"><span class="submit-label">Create a lobby game</span></button>
      </form>
    </body>`);
    frameDocument.close();
    fireEvent.load(frame);
    fireEvent.submit(frameDocument.querySelector("form")!);

    await waitFor(() => {
      expect(fundedComputer.start).toHaveBeenCalledWith({
        level: 8,
        color: "white",
        variant: "standard",
        timeMode: "unlimited",
        stakeUsdc: "5",
        coachEnabled: false,
        lobbyBot: true,
      });
      expect(navigation.push).toHaveBeenCalledWith("/casino/chess/play?match=funded-lobby");
    });
  });

  it("does not let a stale iframe load replace the parent setup route", () => {
    render(<ChessLobbyFrame source="/api/chess/play?setup=ai#game-setup" />);

    screen.getByTitle("Ark Chess").dispatchEvent(new Event("load"));

    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("reveals a rated lobby redirect even when the matching iframe load already fired", async () => {
    const { rerender } = render(
      <ChessLobbyFrame source="/api/chess/play?tab=lobby&setup=hook#game-setup" />
    );
    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    fireEvent.load(frame);
    expect(frame).toHaveClass("opacity-100");

    rerender(<ChessLobbyFrame source="/api/chess/play?tab=lobby" />);

    await waitFor(() => {
      expect(frame).toHaveAttribute("src", "/api/chess/play?tab=lobby");
      expect(frame).toHaveClass("opacity-100");
      expect(frame.style.visibility).toBe("");
    });
  });

  it("clears an expired session and opens the shared login page", async () => {
    render(<ChessLobbyFrame source="/api/chess/play" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(
      '<body>{"success":false,"error":{"code":"UNAUTHORIZED","message":"Sign in to play."}}</body>'
    );
    frameDocument.close();
    fireEvent.load(frame);

    expect(frame).toHaveClass("opacity-0");
    await waitFor(() => {
      expect(auth.logout).toHaveBeenCalledOnce();
      expect(navigation.replace).toHaveBeenCalledWith("/auth");
    });
  });

  it("keeps backend navigation inside the frame for sandbox-safe promotion", () => {
    const frameDocument = document.implementation.createHTMLDocument("Ark Chess");
    frameDocument.body.innerHTML = `
      <a href="http://localhost:3000/api/chess/learn/puzzles" target="_top">Puzzles</a>
      <form action="/play/seeks" target="_top"></form>
      <form action="/api/chess/challenge" data-friend-setup></form>
      <button formtarget="_top">Submit</button>
    `;

    rewriteChessFrameLinks(frameDocument, "http://localhost:3000");

    const link = frameDocument.querySelector("a");
    expect(link?.getAttribute("href")).toBe("http://localhost:3000/api/chess/learn/puzzles");
    expect(link?.dataset.arkRoute).toBe("/casino/chess/puzzles");
    expect(link?.getAttribute("target")).toBeNull();
    const seekForm = frameDocument.querySelector<HTMLFormElement>(
      'form[action="/api/chess/play/seeks"]'
    );
    expect(seekForm).not.toBeNull();
    expect(seekForm?.getAttribute("target")).toBeNull();
    expect(
      frameDocument.querySelector("form[data-friend-setup]")?.getAttribute("target")
    ).toBeNull();
    expect(frameDocument.querySelector("form[data-friend-setup]")?.getAttribute("action")).toBe(
      "/api/chess/challenge"
    );
    expect(frameDocument.querySelector("button")?.getAttribute("formtarget")).toBeNull();
  });

  it("maps the shared invite resolver without dropping the invite id", () => {
    expect(
      chessAppRouteForUrl(
        new URL("http://localhost:3000/api/chess/challenge/invite/invite-id"),
        "",
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/invite?code=invite-id");
  });

  it("promotes accepted challenges and active matches to the canonical play route", () => {
    expect(
      chessRouteForLifecycleSnapshot("challenge", {
        status: "accepted",
        matchId: "accepted-match",
      })
    ).toBe("/casino/chess/play?match=accepted-match");
    expect(chessRouteForLifecycleSnapshot("match", { status: "active" }, "waiting-match")).toBe(
      "/casino/chess/play?match=waiting-match"
    );
    expect(
      chessRouteForLifecycleSnapshot("challenge", {
        status: "created",
        matchId: "waiting-match",
      })
    ).toBeNull();
  });

  it("maps backend tournament pages to their dedicated application routes", () => {
    expect(
      chessAppRouteForUrl(
        new URL("http://localhost:3000/api/chess/competition/arenas/new"),
        "",
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/tournaments/create");
    expect(
      chessAppRouteForUrl(
        new URL("http://localhost:3000/api/chess/competition/swiss/new"),
        "",
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/swiss/create");
  });

  it("opens the lobby puzzle card on the parent puzzle route", () => {
    render(<ChessLobbyFrame source="/api/chess/play" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(
      '<body><a href="/api/chess/learn/puzzles" target="_top">Solve Puzzles</a></body>'
    );
    frameDocument.close();
    fireEvent.load(frame);

    const puzzleLink = frameDocument.querySelector<HTMLAnchorElement>("a")!;
    expect(puzzleLink.getAttribute("href")).toBe("/api/chess/learn/puzzles");
    expect(puzzleLink.getAttribute("target")).toBeNull();

    fireEvent.click(puzzleLink);

    expect(navigation.push).toHaveBeenCalledWith("/casino/chess/puzzles");
  });

  it("routes Back to Arkade through the parent router on the first click", () => {
    expect(
      chessAppRouteForUrl(
        new URL("http://localhost:3000/casino"),
        "back to arkade",
        "http://localhost:3000"
      )
    ).toBe("/casino");

    render(<ChessLobbyFrame source="/api/chess/play" />);
    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument;
    frameDocument!.open();
    frameDocument!.write('<body><a href="/casino" target="_top">Back to Arkade</a></body>');
    frameDocument!.close();
    fireEvent.load(frame);
    fireEvent.click(frameDocument!.querySelector("a")!);

    expect(navigation.push).toHaveBeenCalledWith("/casino");
  });

  it("preserves lobby setup navigation when leaving the embedded page", () => {
    for (const setup of ["ai", "friend", "hook"]) {
      const backendRoute = chessAppRouteForUrl(
        new URL(`http://localhost:3000/api/chess/play?setup=${setup}#game-setup`),
        "",
        "http://localhost:3000"
      );
      expect(backendRoute).toBe(`/casino/chess?setup=${setup}#game-setup`);

      expect(
        chessAppRouteForUrl(
          new URL(`http://localhost:3000${backendRoute}`),
          "",
          "http://localhost:3000"
        )
      ).toBe(backendRoute);
      expect(chessFrameSourceForAppRoute(backendRoute!)).toBe(
        `/api/chess/play?setup=${setup}#game-setup`
      );
    }
  });

  it("promotes frontend routes reached by backend form redirects", () => {
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/casino/chess/play?match=match-1"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/play?match=match-1");
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/play"),
        "http://localhost:3000"
      )
    ).toBeNull();
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/challenge/funded/challenge-1"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/invite?code=challenge-1");
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/play?tab=lobby"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess?tab=lobby");
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/learn/puzzles"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/puzzles");
    expect(
      chessParentRouteForFrameUrl(
        new URL("https://example.com/casino/chess/play?match=match-1"),
        "http://localhost:3000"
      )
    ).toBeNull();
  });

  it("keeps the selected lobby tab in both parent and frame routes", () => {
    const appRoute = chessAppRouteForUrl(
      new URL("http://localhost:3000/api/chess/play?tab=lobby&setup=hook#game-setup"),
      "",
      "http://localhost:3000"
    );

    expect(appRoute).toBe("/casino/chess?tab=lobby&setup=hook#game-setup");
    expect(chessFrameSourceForAppRoute(appRoute!)).toBe(
      "/api/chess/play?tab=lobby&setup=hook#game-setup"
    );
  });

  it.each(["ai", "friend", "hook"])(
    "opens the %s setup inside the iframe without waiting for a refresh",
    async (setup) => {
      render(<ChessLobbyFrame source="/api/chess/play" />);

      const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
      const frameDocument = frame.contentDocument;
      expect(frameDocument).not.toBeNull();
      frameDocument!.open();
      frameDocument!.write(
        `<body><a href="http://localhost:3000/api/chess/play?setup=${setup}#game-setup">Open</a></body>`
      );
      frameDocument!.close();
      fireEvent.load(frame);
      const setupLink = frameDocument!.querySelector("a")!;
      expect(setupLink.getAttribute("target")).toBeNull();
      expect(setupLink.dataset.arkRoute).toBe(`/casino/chess?setup=${setup}#game-setup`);
      fireEvent.click(setupLink);

      expect(navigation.push).toHaveBeenCalledWith(`/casino/chess?setup=${setup}#game-setup`);
      await waitFor(() => {
        expect(frame).toHaveAttribute("src", `/api/chess/play?setup=${setup}#game-setup`);
      });
    }
  );

  it("funds a positive friend stake and opens the shareable invite", async () => {
    fundedFriend.create.mockResolvedValue({ challenge: { id: "funded-match" } });
    render(<ChessLobbyFrame source="/api/chess/play?setup=friend" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(`<body>
      <form data-friend-setup>
        <select name="time_control"><option value="300+3" selected>5+3</option></select>
        <input name="mode" value="rated" checked type="radio">
        <input name="color" value="black" checked type="radio">
        <input name="stake_usdc" value="5">
        <strong data-friend-balance></strong>
        <p data-friend-stake-error hidden></p>
        <button type="submit"><span class="submit-label">Challenge a friend</span></button>
      </form>
    </body>`);
    frameDocument.close();
    fireEvent.load(frame);
    fireEvent.submit(frameDocument.querySelector("form")!);

    await waitFor(() => {
      expect(fundedFriend.create).toHaveBeenCalledWith({
        timeControl: "5+3",
        mode: "invite",
        rated: true,
        color: "black",
        allowTimeExtensions: false,
        videoEnabled: true,
        stakeUsdc: "5",
      });
      expect(navigation.push).toHaveBeenCalledWith("/casino/chess/invite?code=funded-match");
    });
  });

  it("funds the second seat from the full challenge page before joining", async () => {
    fundedFriend.accept.mockResolvedValue({ id: "funded-match" });
    render(<ChessLobbyFrame source="/api/chess/challenge/funded/funded-match" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(`<body>
      <form data-funded-friend-accept data-match-id="funded-match">
        <input name="stake_usdc" value="5">
        <p data-funded-friend-status></p>
        <button type="submit"><span class="submit-label">Join the game</span></button>
      </form>
    </body>`);
    frameDocument.close();
    fireEvent.load(frame);
    fireEvent.submit(frameDocument.querySelector("form")!);

    await waitFor(() => {
      expect(fundedFriend.accept).toHaveBeenCalledWith("funded-match", "5");
      expect(navigation.push).toHaveBeenCalledWith("/casino/chess/play?match=funded-match");
    });
  });

  it("funds a paid tournament entry before submitting the backend join form", async () => {
    const response = {
      ok: true,
      url: "http://localhost:3000/api/chess/competition/arenas/arena-1",
      text: vi.fn(() => Promise.resolve("")),
    } as unknown as Response;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    fundedFriend.fundEntry.mockImplementation(
      async (_entryFee: string, action: (txHash: string) => Promise<Response>) => action("0xtx")
    );
    render(<ChessLobbyFrame source="/api/chess/competition/arenas/arena-1" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(`<body>
      <form data-tournament-entry data-entry-fee="2.5"
        action="http://localhost:3000/api/chess/competition/arenas/arena-1/join">
        <p data-tournament-entry-status></p>
        <button type="submit"><span class="submit-label">Join Arena</span></button>
      </form>
    </body>`);
    frameDocument.close();
    fireEvent.load(frame);
    fireEvent.submit(frameDocument.querySelector("form")!);

    await waitFor(() => {
      expect(fundedFriend.fundEntry).toHaveBeenCalledWith("2.5", expect.any(Function));
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3000/api/chess/competition/arenas/arena-1/join",
        expect.objectContaining({ method: "POST" })
      );
      expect(navigation.push).toHaveBeenCalledWith("/casino/chess/tournaments/arena-1");
    });
    fetchMock.mockRestore();
  });
});
