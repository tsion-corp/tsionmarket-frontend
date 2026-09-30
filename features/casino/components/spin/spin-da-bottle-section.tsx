/* eslint-disable @next/next/no-img-element */
"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { useMoney } from "@/components/ui/currency-select";
import { SquareAvatar } from "@/components/ui/square-avatar";
import { GameMoneyInput } from "@/features/casino/components/game-money-input";
import { useSpinComments } from "@/features/casino/hooks/use-spin-comments";
import { useSpinDaBottle } from "@/features/casino/hooks/use-spin-da-bottle";
import type { SpinOutcome, SpinPick, SpinWager } from "@/features/casino/lib/api/spin";
import { amountUnits, normalizeArkjetAmount } from "@/features/casino/lib/arkjet-funding";
import { gameActionError } from "@/features/casino/lib/game-error";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fromBaseUnits } from "@/lib/trade/math";
import styles from "./spin-da-bottle.module.css";

const ASSET = "/casino/spin-da-bottle";
const GAME_WIDTH = 360;
const GAME_HEIGHT = 640;
const MAX_DESKTOP_SCALE = 1.25;
const MAXIMUM_STAKE = 20_000;
const REVEAL_MS = 3_500;
const CHAT_MAX_LENGTH = 160;
const CHIPS = [
  { value: 0.1, asset: "chip-blue.svg" },
  { value: 0.5, asset: "chip-light-purple.svg" },
  { value: 1, asset: "chip-dark-orange.svg" },
  { value: 5, asset: "chip-purple.svg" },
  { value: 10, asset: "chip-grey.svg" },
  { value: 20_000, asset: "chip-bright-pink.svg" },
] as const;

const ArkjetCashier = dynamic(
  () =>
    import("@/features/casino/components/arkjet/arkjet-cashier").then(
      (module) => module.ArkjetCashier
    ),
  { ssr: false }
);

const ArkadeCampaignBadge = dynamic(
  () =>
    import("@/features/casino/components/campaign/arkade-campaign-badge").then(
      (module) => module.ArkadeCampaignBadge
    ),
  { ssr: false }
);

type Phase = "betting" | "requesting" | "spinning" | "result";
type ConfirmRequest = { pick: SpinPick; rebet: boolean };

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function maskedChatName(name: string, own: boolean) {
  if (own) return "You";
  const compact = name.trim().replace(/\s+/gu, "");
  if (compact.length < 2) return `${compact || "P"}***`;
  return `${compact[0]}***${compact.at(-1)}`;
}

function rotationFor(outcome: SpinOutcome, resultHash: string | null) {
  const seed = Number.parseInt((resultHash ?? "0").replace(/^0x/, "").slice(0, 8), 16) || 0;
  if (outcome === "MIDDLE") return 1_440 + (seed % 2 === 0 ? 0 : 180);
  if (outcome === "UP") return 1_440 + 195 + (seed % 151);
  return 1_440 + 15 + (seed % 61);
}

function resultAsset(wager: SpinWager) {
  const outcome = wager.effectiveOutcome?.toLowerCase() ?? "middle";
  if (outcome === "middle") return `${ASSET}/result-middle.png`;
  return `${ASSET}/result-${wager.won ? "win" : "lose"}-${outcome}.png`;
}

export function SpinDaBottleSection() {
  const game = useSpinDaBottle();
  const portfolio = usePortfolio({ scope: "base" });
  const modals = useAppModals();
  const money = useMoney();
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useSpinComments(chatOpen && game.authReady && game.authenticated);
  const [amount, setAmount] = useState("0.10");
  const [phase, setPhase] = useState<Phase>("betting");
  const [result, setResult] = useState<SpinWager | null>(null);
  const [rotation, setRotation] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [cashierInitialAmount, setCashierInitialAmount] = useState<string | undefined>();
  const [chatText, setChatText] = useState("");
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const sequence = useRef(0);
  const bottleSound = useRef<HTMLAudioElement | null>(null);
  const chatMessages = useRef<HTMLDivElement | null>(null);

  const rules = game.rules;
  const currency = rules?.currency ?? game.balance?.currency ?? "USDC";
  const displayCurrency = money.ready ? money.currency.code : "USD";
  const formatGameMoney = (value: string | null | undefined) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? money.formatExact(parsed) : String(value ?? "");
  };
  const decimals = rules?.currencyDecimalPlaces ?? 6;
  const minimum = rules?.minimumAmount ?? "0.1";
  const ruleMaximum = Number(rules?.maximumStake ?? MAXIMUM_STAKE);
  const available = Number(game.balance?.available ?? 0);
  const maximum = Math.max(Number(minimum), Math.min(ruleMaximum, MAXIMUM_STAKE));
  const normalized = normalizeArkjetAmount(amount, decimals);
  const amountInRange =
    normalized !== null &&
    amountUnits(normalized, decimals) >= amountUnits(minimum, decimals) &&
    Number(normalized) <= maximum;
  const hasSufficientBalance = game.balance === null || Number(normalized) <= available;
  const validAmount = amountInRange && hasSufficientBalance;
  const requiredUnits = amountUnits(normalized, decimals);
  const playableUnits = amountUnits(
    normalizeArkjetAmount(game.balance?.available ?? "0", decimals),
    decimals
  );
  const shortfallUnits = requiredUnits > playableUnits ? requiredUnits - playableUnits : 0n;
  const walletToken = portfolio.tokens.find(
    (token) => token.network === "base-mainnet" && token.symbol.toUpperCase() === "USDC"
  );
  const walletRaw = BigInt(walletToken?.rawBalance ?? "0");
  const sliderValue = Math.min(
    maximum,
    Math.max(Number(minimum), Number(amount) || Number(minimum))
  );
  const sliderProgress =
    maximum <= Number(minimum)
      ? 0
      : ((sliderValue - Number(minimum)) / (maximum - Number(minimum))) * 100;
  const busy = phase === "requesting" || phase === "spinning" || game.pending;

  useEffect(() => {
    bottleSound.current = new Audio(`${ASSET}/bottle-spin.mp3`);
    bottleSound.current.volume = 0.7;
    return () => {
      sequence.current += 1;
      bottleSound.current?.pause();
    };
  }, []);

  useEffect(() => {
    const resize = () => {
      const desktop = window.innerWidth > 480;
      const nextScale = desktop
        ? Math.min(
            MAX_DESKTOP_SCALE,
            (window.innerWidth - 48) / GAME_WIDTH,
            (window.innerHeight - 48) / GAME_HEIGHT
          )
        : Math.min(MAX_DESKTOP_SCALE, window.innerWidth / GAME_WIDTH);
      setScale(Math.max(0.25, nextScale));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      setMenuOpen(false);
      setHelpOpen(false);
      setChatOpen(false);
      setConfirmRequest(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy]);

  useEffect(() => {
    if (!chatOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const messages = chatMessages.current;
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chat.items.length, chatOpen]);

  function changeAmount(next: number) {
    const clamped = Math.min(maximum, Math.max(Number(minimum), next));
    setAmount(clamped.toFixed(2));
    setNotice(null);
  }

  function openFunding() {
    if (!portfolio.loading && walletRaw < shortfallUnits) {
      modals.openFunds();
      return;
    }
    setCashierInitialAmount(fromBaseUnits(shortfallUnits, decimals));
    setCashierOpen(true);
  }

  async function executeSpin(playerPick: SpinPick, rebet = false) {
    if (!normalized || !validAmount || busy) return;
    const currentSequence = ++sequence.current;
    setConfirmRequest(null);
    setNotice(null);
    if (rebet) {
      setResult(null);
      setPhase("betting");
      setRotation(0);
      await delay(600);
      if (sequence.current !== currentSequence) return;
    }
    setPhase("requesting");
    try {
      const wager = await game.play({ amount: normalized, currency, playerPick });
      if (sequence.current !== currentSequence || !wager.effectiveOutcome) return;
      setResult(wager);
      setRotation(rotationFor(wager.effectiveOutcome, wager.resultHash));
      setPhase("spinning");
      window.setTimeout(() => {
        if (!bottleSound.current) return;
        bottleSound.current.currentTime = 0;
        void bottleSound.current.play().catch(() => undefined);
      }, 400);
      await delay(REVEAL_MS);
      if (sequence.current !== currentSequence) return;
      setPhase("result");
      if (wager.won) void confetti({ particleCount: 70, spread: 65, origin: { y: 0.72 } });
    } catch (error) {
      if (sequence.current !== currentSequence) return;
      setPhase("betting");
      setNotice(gameActionError(error, "Spin Da Bottle", "That spin could not be completed."));
    }
  }

  function choose(playerPick: SpinPick, rebet = false) {
    if (!game.authReady || busy) return;
    if (!game.authenticated) {
      game.login();
      return;
    }
    if (!amountInRange) {
      setNotice(
        `Choose an amount from ${formatGameMoney(minimum)} to ${formatGameMoney(String(maximum))}.`
      );
      return;
    }
    if (!hasSufficientBalance) {
      openFunding();
      return;
    }
    setConfirmRequest({ pick: playerPick, rebet });
  }

  function newRound() {
    sequence.current += 1;
    setResult(null);
    setRotation(0);
    setPhase("betting");
    setNotice(null);
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatText.trim();
    if (!message || chat.sending) return;
    if (!game.authenticated) {
      game.login();
      return;
    }
    try {
      await chat.send(message);
      setChatText("");
      setChatNotice(null);
    } catch (error) {
      setChatNotice(error instanceof Error ? error.message : "Could not send that message.");
    }
  }

  const scaledStyle = {
    "--game-scale": scale,
    width: GAME_WIDTH * scale,
    height: GAME_HEIGHT * scale,
  } as CSSProperties;
  const bottleStyle = { "--bottle-rotation": `${rotation}deg` } as CSSProperties;
  const sliderStyle = { "--slider-fill": `${sliderProgress}%` } as CSSProperties;

  return (
    <div className={styles.viewport}>
      <div className={styles.arkGamesBrand} aria-hidden>
        <img src="/ark-logo.svg" alt="" />
      </div>
      <div className={styles.frame} style={scaledStyle}>
        <main className={styles.game} aria-label="Spin da' Bottle">
          {game.loading ? (
            <div className={styles.loader} aria-label="Loading Spin da' Bottle">
              <div className={styles.loaderBrand}>
                <img src="/ark-logo.svg" alt="" />
              </div>
              <div className={styles.loaderProgress}>
                <span />
              </div>
            </div>
          ) : (
            <>
              <header className={styles.headerWrap}>
                <div className={styles.headerRow}>
                  <Link href="/casino" className={styles.headerIcon} aria-label="Back to Arkade">
                    <img src={`${ASSET}/back.svg`} alt="" />
                  </Link>
                  <h1>Spin da&apos; Bottle</h1>
                  <div className={styles.headerActions}>
                    <button
                      type="button"
                      className={styles.chatIcon}
                      aria-label="Open chat"
                      onClick={() => {
                        setMenuOpen(false);
                        setChatOpen(true);
                      }}
                    >
                      <img src={`${ASSET}/chat.png`} alt="" />
                    </button>
                    <button
                      type="button"
                      className={styles.headerIcon}
                      aria-label="Open game menu"
                      onClick={() => {
                        setChatOpen(false);
                        setMenuOpen(true);
                      }}
                    >
                      <img src={`${ASSET}/menu.svg`} alt="" />
                    </button>
                  </div>
                </div>
                <div className={styles.walletRow}>
                  <img src={`${ASSET}/wallet.svg`} alt="" />
                  <strong>{formatGameMoney(game.balance?.available ?? "0")}</strong>
                </div>
                <button
                  type="button"
                  className={styles.addMoneyLink}
                  onClick={() => {
                    setCashierInitialAmount(undefined);
                    setCashierOpen(true);
                  }}
                >
                  + Add Money
                </button>
                <ArkadeCampaignBadge
                  className={styles.campaignSlot}
                  enabled={game.authReady && game.authenticated}
                />
              </header>

              <div className={styles.boardRow}>
                <div className={styles.board}>
                  <img
                    src={`${ASSET}/bottle.png`}
                    alt="Bottle"
                    style={bottleStyle}
                    className={`${styles.bottle} ${phase === "spinning" ? styles.bottleSpinning : ""}`}
                  />
                </div>
              </div>

              {phase !== "result" ? (
                <section className={`${styles.bet} ${busy ? styles.disabled : ""}`}>
                  <label className={styles.betAmount}>
                    <span>Bet</span>
                    <img className={styles.betChip} src={`${ASSET}/chip-blue-small.svg`} alt="" />
                    <GameMoneyInput
                      inputMode="decimal"
                      value={amount}
                      currencyDecimals={decimals}
                      disabled={busy}
                      aria-label="Bet amount"
                      onValueChange={setAmount}
                    />
                    <small>{displayCurrency}</small>
                  </label>
                  <div className={styles.sliderRow}>
                    <span>{money.format(Number(minimum))}</span>
                    <input
                      className={styles.slider}
                      style={sliderStyle}
                      type="range"
                      min={Number(minimum)}
                      max={maximum}
                      step={Number(minimum)}
                      value={sliderValue}
                      disabled={busy || maximum <= Number(minimum)}
                      aria-label="Bet amount slider"
                      onChange={(event) => changeAmount(Number(event.target.value))}
                    />
                    <span>{money.format(maximum)}</span>
                  </div>
                  <div className={styles.chipCarousel}>
                    <span className={styles.chipArrow} aria-hidden>
                      ‹
                    </span>
                    <div className={styles.chipTrack}>
                      {CHIPS.map((chip) => {
                        const disabled = busy || chip.value > maximum;
                        return (
                          <button
                            type="button"
                            key={chip.value}
                            disabled={disabled}
                            aria-label={`Set bet to ${money.format(chip.value)}`}
                            onClick={() => changeAmount(chip.value)}
                          >
                            <img src={`${ASSET}/${chip.asset}`} alt="" />
                            <b>{money.format(chip.value)}</b>
                          </button>
                        );
                      })}
                    </div>
                    <span className={styles.chipArrow} aria-hidden>
                      ›
                    </span>
                  </div>
                  <div className={styles.minMax}>
                    <span>Min : {money.format(Number(minimum))}</span>
                    <span>Max : {money.format(maximum)}</span>
                  </div>
                  {notice ? <p className={styles.notice}>{notice}</p> : null}
                  {game.error && !notice ? (
                    <p className={styles.notice}>
                      {gameActionError(
                        game.error,
                        "Spin Da Bottle",
                        "The game is unavailable right now."
                      )}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {phase === "result" && result?.effectiveOutcome ? (
                <section className={styles.resultPanel} aria-live="polite">
                  {result.won ? (
                    <img className={styles.glowTop} src={`${ASSET}/glow-top.png`} alt="" />
                  ) : null}
                  <div
                    className={styles.resultBanner}
                    style={{ backgroundImage: `url(${resultAsset(result)})` }}
                  >
                    <strong>{result.effectiveOutcome}</strong>
                  </div>
                  {result.won ? (
                    <img className={styles.glowBottom} src={`${ASSET}/glow-bottom.png`} alt="" />
                  ) : null}
                  {result.won ? (
                    <p>
                      You Won <b>{formatGameMoney(result.payout)}</b>
                    </p>
                  ) : result.effectiveOutcome === "MIDDLE" ? (
                    <p>The bottle stopped at MIDDLE. You lose this round.</p>
                  ) : (
                    <p>Sorry, you chose {result.playerPick}!</p>
                  )}
                </section>
              ) : null}

              {phase === "result" && result?.playerPick ? (
                <div className={styles.resultActions}>
                  <button type="button" onClick={() => choose(result.playerPick!, true)}>
                    Rebet
                  </button>
                  <button type="button" onClick={newRound}>
                    New Round
                  </button>
                </div>
              ) : (
                <div className={styles.pickActions}>
                  <button
                    type="button"
                    aria-label="UP"
                    disabled={busy}
                    onClick={() => choose("UP")}
                  >
                    <strong>UP</strong>
                    <span>Pays 2x</span>
                  </button>
                  <button
                    type="button"
                    aria-label="DOWN"
                    disabled={busy}
                    onClick={() => choose("DOWN")}
                  >
                    <strong>DOWN</strong>
                    <span>Pays 2x</span>
                  </button>
                </div>
              )}

              {chatOpen ? (
                <>
                  <button
                    type="button"
                    className={styles.backdrop}
                    aria-label="Close chat"
                    onClick={() => setChatOpen(false)}
                  />
                  <section
                    className={styles.chatModal}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="spin-chat-title"
                  >
                    <header className={styles.chatHeader}>
                      <div className={styles.chatOnline}>
                        <span>Online</span>
                        <i aria-hidden />
                        <strong>{chat.onlineCount}</strong>
                      </div>
                      <h2 id="spin-chat-title">Chat</h2>
                      <button
                        type="button"
                        aria-label="Close chat"
                        onClick={() => setChatOpen(false)}
                      >
                        ×
                      </button>
                    </header>
                    <div ref={chatMessages} className={styles.chatMessages} aria-live="polite">
                      {!game.authenticated ? (
                        <p className={styles.chatEmpty}>Sign in to see and join the live chat.</p>
                      ) : chat.loading ? (
                        <p className={styles.chatEmpty}>Loading live chat...</p>
                      ) : chat.error ? (
                        <p className={styles.chatEmpty}>Live chat is unavailable right now.</p>
                      ) : chat.items.length === 0 ? (
                        <p className={styles.chatEmpty}>No messages yet. Start the conversation.</p>
                      ) : (
                        chat.items.map((message) => (
                          <article className={styles.chatMessage} key={message.id}>
                            <SquareAvatar
                              src={null}
                              seed={message.avatarSeed}
                              name={message.authorName}
                              size={24}
                            />
                            <p>
                              <strong>{maskedChatName(message.authorName, message.isOwn)}</strong>{" "}
                              {message.text}
                            </p>
                          </article>
                        ))
                      )}
                    </div>
                    <form className={styles.chatComposer} onSubmit={sendChat}>
                      <span>
                        {chatText.length}/{CHAT_MAX_LENGTH}
                      </span>
                      <textarea
                        value={chatText}
                        maxLength={CHAT_MAX_LENGTH}
                        rows={1}
                        disabled={chat.sending}
                        aria-label="Chat message"
                        placeholder="Write Something"
                        onChange={(event) => {
                          setChatText(event.target.value);
                          setChatNotice(null);
                        }}
                      />
                      <button type="submit" disabled={!chatText.trim() || chat.sending}>
                        Send
                      </button>
                      {chatNotice ? <small role="alert">{chatNotice}</small> : null}
                    </form>
                  </section>
                </>
              ) : null}

              {menuOpen ? (
                <>
                  <button
                    className={styles.backdrop}
                    aria-label="Close game menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <aside className={styles.drawer} aria-label="Game menu">
                    <h2>Spin da&apos; Bottle</h2>
                    <div className={styles.playerRow}>
                      <SquareAvatar
                        src={null}
                        seed={game.profile.avatarSeed}
                        name={game.profile.name}
                        size={30}
                      />
                      <strong>{game.profile.name}</strong>
                    </div>
                    <div className={styles.drawerMenu}>
                      <button
                        type="button"
                        className={styles.menuRow}
                        onClick={() => {
                          setMenuOpen(false);
                          setHelpOpen(true);
                        }}
                      >
                        <img src={`${ASSET}/menu-help.png`} alt="" />
                        <span>How to Play</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.drawerAddMoney}
                      onClick={() => {
                        setMenuOpen(false);
                        setCashierInitialAmount(undefined);
                        setCashierOpen(true);
                      }}
                    >
                      + Add Money
                    </button>
                  </aside>
                </>
              ) : null}

              {confirmRequest ? (
                <div className={styles.modalBackdrop}>
                  <section
                    className={styles.confirmModal}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="spin-confirm-title"
                  >
                    <h2 id="spin-confirm-title">Confirm Bet</h2>
                    <p>
                      Place bet of {formatGameMoney(normalized)} for {confirmRequest.pick}?
                    </p>
                    <div>
                      <button type="button" onClick={() => setConfirmRequest(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void executeSpin(confirmRequest.pick, confirmRequest.rebet)}
                      >
                        Confirm
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}

              {helpOpen ? (
                <div className={styles.modalBackdrop}>
                  <section
                    className={styles.helpModal}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="how-title"
                  >
                    <div className={styles.helpScroll}>
                      <h2 id="how-title">About Spin da&apos; Bottle</h2>
                      <p>
                        <b>1.</b> The objective of this game is to predict whether the bottle&apos;s
                        neck will stop facing UP or DOWN.
                      </p>
                      <p>
                        <b>2.</b> The game is played with a bottle placed on a circular table. The
                        table is divided into two halves - UP and DOWN. Once the player places
                        his/her bet, the bottle is spun. The bottle, after spinning a few rounds,
                        comes to a stop and the neck&apos;s position decides the result.
                      </p>
                      <img src={`${ASSET}/how-to-play.png`} alt="UP and DOWN bottle positions" />
                      <p>
                        <b>3.</b> Players can select their desired stake amount by adjusting the
                        slider between the minimum and maximum amount or by pressing the chips.
                      </p>
                      <p>
                        <b>4.</b> Each winning turn pays DOUBLE (2X).
                      </p>
                      <p>
                        <b>5.</b> In case the bottle&apos;s neck stops at the MIDDLE player loses
                        the bet.
                      </p>
                    </div>
                  </section>
                  <button
                    type="button"
                    className={styles.floatingClose}
                    aria-label="Close how to play"
                    onClick={() => setHelpOpen(false)}
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>
      {cashierOpen ? (
        <ArkjetCashier
          balance={game.balance}
          minimumAmount={minimum}
          initialAmount={cashierInitialAmount}
          productName="Spin Da Bottle"
          tone="chicken"
          fundingScope="spin"
          onClose={() => setCashierOpen(false)}
          onOpenFunds={() => {
            setCashierOpen(false);
            modals.openFunds();
          }}
        />
      ) : null}
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </div>
  );
}
