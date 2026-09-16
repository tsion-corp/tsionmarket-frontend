import { start_default as start } from "/compiled/lib.MVDLUPAI.js";
import { patch } from "/compiled/lib.UZWUG6PB.js";

let destroyLayout = () => {};
let destroyCoach = () => {};

function coachCard() {
  const card = document.createElement("section");
  card.className = "ark-analysis-coach";
  card.dataset.arkCoachCard = "";
  card.dataset.classification = "good";
  card.setAttribute("aria-live", "polite");
  card.innerHTML = `
    <div class="ark-analysis-coach__avatar">
      <img src="/chess/ark-coach.svg" alt="ArkChess coach">
      <span class="ark-analysis-coach__badge" data-ark-coach-badge>✓</span>
    </div>
    <div class="ark-analysis-coach__bubble">
      <div class="ark-analysis-coach__eyebrow">ArkChess coach</div>
      <h3 class="ark-analysis-coach__title" data-ark-coach-title>Reviewing your game</h3>
      <p class="ark-analysis-coach__comment" data-ark-coach-comment>Select a move to see the coach's explanation.</p>
      <div class="ark-analysis-coach__correction" data-ark-coach-correction hidden>
        Best was <strong data-ark-coach-best></strong>
      </div>
    </div>
    <div class="ark-analysis-coach__tools">
      <button class="button button-metal text" type="button" data-ark-coach-voice aria-pressed="false">Coach voice: Off</button>
    </div>`;
  return card;
}

function keepCoachMounted(root, enabled) {
  destroyCoach();
  if (!enabled) return;

  const card = coachCard();
  const ensure = () => {
    const tools = root.querySelector(".analyse__tools");
    if (!(tools instanceof HTMLElement) || card.isConnected) return;
    const moves = tools.querySelector(":scope > .analyse__moves");
    tools.insertBefore(card, moves);
  };

  ensure();
  const observer = new MutationObserver(ensure);
  observer.observe(root, { childList: true, subtree: true });
  destroyCoach = () => {
    observer.disconnect();
    card.remove();
  };
}

function keepChatAligned(root) {
  destroyLayout();

  const sync = () => {
    const board = root.querySelector(".analyse__board .cg-wrap");
    const meta = root.querySelector(".analyse__side .game__meta");
    const chat = root.querySelector(".mchat");
    if (!(board instanceof HTMLElement) || !(meta instanceof HTMLElement) || !(chat instanceof HTMLElement)) return;

    chat.style.height = `${Math.max(160, board.offsetHeight - meta.offsetHeight - 16)}px`;
  };

  const resizeObserver = new ResizeObserver(sync);
  const mutationObserver = new MutationObserver(sync);
  const board = root.querySelector(".analyse__board");
  const meta = root.querySelector(".analyse__side");
  if (board) resizeObserver.observe(board);
  if (meta) resizeObserver.observe(meta);
  mutationObserver.observe(root, { childList: true, subtree: true });
  window.addEventListener("resize", sync);
  requestAnimationFrame(sync);

  destroyLayout = () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    window.removeEventListener("resize", sync);
  };
}

// Keep Lichess's complete analysis controller and view, but let Ark own the
// transport. The stock replay bootstrap always opens /watch/... on Lichess's
// socket protocol, which is not compatible with the Ark gateway.
export async function initModule({ mode, cfg }) {
  await site.asset.loadPieces;
  if (mode !== "replay") throw new Error(`Unsupported Ark analysis mode: ${mode}`);

  cfg.$side = $(".analyse__side").clone();
  cfg.$underboard = $(".analyse__underboard").clone();
  cfg.socketSend ||= () => undefined;
  const controller = start(patch)(cfg);
  const root = document.querySelector("main.analyse");
  if (root instanceof HTMLElement) {
    keepChatAligned(root);
    keepCoachMounted(root, Boolean(cfg.data.analysis));
  }
  return controller;
}

export function destroyModule() {
  destroyLayout();
  destroyCoach();
  destroyLayout = () => {};
  destroyCoach = () => {};
}
