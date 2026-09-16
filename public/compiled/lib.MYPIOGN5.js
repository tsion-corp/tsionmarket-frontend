import {
  fenColor
} from "./lib.LRP46MC3.js";
import {
  Chessground
} from "./lib.AEOHBIQD.js";
import {
  uciToMove
} from "./lib.RPQH5UYI.js";
import {
  COLORS
} from "./lib.53PYQRAK.js";
import {
  get,
  set
} from "./lib.CAO7TYYH.js";
import {
  Janitor,
  wsSend
} from "./lib.PNHYIP7B.js";
import {
  bind,
  dataIcon,
  hl,
  isTouchDevice,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  h
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  form,
  text
} from "./lib.TT4QSUKQ.js";
import {
  blurIfPrimaryClick,
  defined,
  escapeHtml,
  frag,
  myUserId,
  onClickAway,
  toggle
} from "./lib.GMEH5BEF.js";

// ../lib/src/view/controls.ts
function enter(effect) {
  return (e) => {
    if (e instanceof KeyboardEvent && e.key === "Enter") effect(e.target);
  };
}
function toggleBoxInit() {
  $(".toggle-box--toggle:not(.toggle-box--ready)").each(function() {
    const toggle2 = () => this.classList.toggle("toggle-box--toggle-off");
    $(this).addClass("toggle-box--ready").children("legend").on("click", toggle2).on("keydown", enter(toggle2));
  });
}
function rangeConfig(read, write) {
  return {
    ...onInsert((el) => {
      el.value = String(read());
      el.addEventListener("input", () => write(parseInt(el.value)));
      el.addEventListener("mouseout", () => el.blur());
    }),
    update: (_, v) => {
      v.elm.value = `${read()}`;
    }
  };
}
var boolPrefXhrToggle = (prefKey, val, effect = site.reload) => toggle(val, async (v) => {
  await text(`/pref/${prefKey}`, { method: "post", body: form({ [prefKey]: v ? "1" : "0" }) });
  effect();
});
function copyMeInput(content, opts = {}) {
  return h("div.copy-me", [
    h("input.copy-me__target", {
      attrs: { spellcheck: "false", ...opts.inputAttrs },
      props: { value: content },
      on: opts.on
    }),
    h("button.copy-me__button.button.button-metal", {
      attrs: { "data-icon": licon.Clipboard, title: i18n.site.copyToClipboard }
    })
  ]);
}
var addPasswordVisibilityToggleListener = () => {
  $(".password-wrapper").each(function() {
    const $wrapper = $(this);
    const $button = $wrapper.find(".password-reveal");
    $button.on("click", (e) => {
      var _a;
      e.preventDefault();
      const $input = $wrapper.find("input");
      const type = $input.attr("type") === "password" ? "text" : "password";
      $input.attr("type", type);
      $button.toggleClass("revealed", type === "text");
      (_a = $input[0]) == null ? void 0 : _a.focus();
    });
  });
};
var pathAttrs = [
  {
    "stroke-width": 3.779,
    d: "m21.78 12.64c-1.284 8.436 8.943 12.7 14.54 17.61 3 2.632 4.412 4.442 5.684 7.93"
  },
  {
    "stroke-width": 4.157,
    d: "m43.19 36.32c2.817-1.203 6.659-5.482 5.441-7.623-2.251-3.957-8.883-14.69-11.89-19.73-0.4217-0.7079-0.2431-1.835 0.5931-3.3 1.358-2.38 1.956-5.628 1.956-5.628"
  },
  {
    "stroke-width": 4.535,
    d: "m37.45 2.178s-3.946 0.6463-6.237 2.234c-0.5998 0.4156-2.696 0.7984-3.896 0.6388-17.64-2.345-29.61 14.08-25.23 27.34 4.377 13.26 22.54 25.36 39.74 8.666"
  }
];
var spinnerHtml = `<div class="spinner" aria-label="loading"><svg viewBox="-2 -2 54 54"><g mask="url(#spinner-mask)" fill="none"> ${pathAttrs.map(
  (a2, i) => `<path id="${String.fromCharCode(97 + i)}" stroke-width="${a2["stroke-width"]}" d="${a2.d}"/>`
)}
      </g>
    </svg>
  </div>`;
var spinnerVdom = (box = "-2 -2 54 54") => h("div.spinner", { "aria-label": "loading" }, [
  h("svg", { attrs: { viewBox: box } }, [
    h(
      "g",
      { attrs: { mask: "url(#spinner-mask)", fill: "none" } },
      pathAttrs.map((attrs) => h("path", { attrs }))
    )
  ])
]);

// ../lib/src/view/dialog.ts
async function domDialog(o) {
  var _a, _b, _c, _d, _e;
  const html = await loadAssets(o);
  const dialog = document.createElement("dialog");
  for (const [k, v] of Object.entries((_b = (_a = o.attrs) == null ? void 0 : _a.dialog) != null ? _b : {})) dialog.setAttribute(k, String(v));
  if (isTouchDevice()) dialog.classList.add("touch-scroll");
  if (o.parent) dialog.style.position = "absolute";
  if (!o.noCloseButton) {
    const anchor = frag('<div class="close-button-anchor">');
    anchor.innerHTML = `<button class="close-button" aria-label="Close" data-icon="${licon.X}">`;
    dialog.appendChild(anchor);
  }
  const view = document.createElement("div");
  view.classList.add("dialog-content");
  if (o.class) view.classList.add(...o.class.split(/[. ]/).filter(Boolean));
  for (const [k, v] of Object.entries((_d = (_c = o.attrs) == null ? void 0 : _c.view) != null ? _d : {})) view.setAttribute(k, String(v));
  if (html) view.innerHTML = html;
  const scrollable = frag(`<div class="${o.noScrollable ? "not-" : ""}scrollable">`);
  scrollable.appendChild(view);
  dialog.appendChild(scrollable);
  ((_e = o.parent) != null ? _e : document.body).appendChild(dialog);
  const wrapper = new DialogWrapper(dialog, view, o);
  return o.show ? wrapper.show() : wrapper;
}
function snabDialog(o) {
  var _a, _b, _c, _d, _e;
  let dialog;
  const classes = (_b = (_a = o.class) == null ? void 0 : _a.split(/[. ]/).filter(Boolean)) != null ? _b : [];
  const dialogVNode = hl(
    "dialog",
    {
      class: { "touch-scroll": isTouchDevice() },
      key: (_c = o.class) != null ? _c : "dialog",
      attrs: (_d = o.attrs) == null ? void 0 : _d.dialog,
      hook: onInsert((el) => dialog = el)
    },
    [
      o.noCloseButton || hl(
        "div.close-button-anchor",
        hl("button.close-button", { attrs: { "data-icon": licon.X, "aria-label": i18n.site.close } })
      ),
      hl(
        "div",
        { class: { scrollable: !o.noScrollable } },
        hl(
          "div.dialog-content",
          {
            class: Object.fromEntries(classes.map((c) => [c, true])),
            attrs: (_e = o.attrs) == null ? void 0 : _e.view,
            hook: onInsert(async (view) => {
              const html = await loadAssets(o);
              if (!o.vnodes && html) view.innerHTML = html;
              const dlg = new DialogWrapper(dialog, view, o);
              if (o.onInsert) o.onInsert(dlg);
              else dlg.show();
            })
          },
          o.vnodes
        )
      )
    ]
  );
  if (!o.modal) return dialogVNode;
  return hl("div.snab-modal-mask", { class: { none: Boolean(o.onInsert) } }, dialogVNode);
}
var easyCloseHandler = new class {
  constructor() {
    this.stack = [];
    this.pointerdown = (e) => {
      var _a;
      if (!((_a = this.top) == null ? void 0 : _a.o.easyClose)) return;
      if (this.top.o.easyClose === "clickOutside") {
        const { clientX: x, clientY: y } = e;
        const bounds = this.top.dialog.getBoundingClientRect();
        if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) return;
      }
      if (e.pointerType === "touch" || !this.top.o.modal)
        window.addEventListener(
          "click",
          (e2) => {
            e2.preventDefault();
            e2.stopImmediatePropagation();
          },
          { once: true, capture: true }
        );
      this.top.close("cancel");
      e.stopPropagation();
    };
  }
  push(dlg) {
    if (!dlg.o.easyClose) return;
    if (this.stack.length === 0)
      document.addEventListener("pointerdown", this.pointerdown, { capture: true });
    this.stack.push(dlg);
  }
  remove(dlg) {
    this.stack = this.stack.filter((d) => d !== dlg);
    if (this.stack.length === 0)
      document.removeEventListener("pointerdown", this.pointerdown, { capture: true });
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
}();
var DialogWrapper = class {
  constructor(dialog, view, o, ctx = o.ctx) {
    this.dialog = dialog;
    this.view = view;
    this.o = o;
    this.ctx = ctx;
    this.dialogEvents = new Janitor();
    this.actionEvents = new Janitor();
    this.observer = new MutationObserver((list) => {
      for (const m of list)
        if (m.type === "childList")
          for (const n of m.removedNodes) {
            if (n === this.dialog) {
              this.onRemove();
              return;
            }
          }
    });
    this.focusQuery = 'button, input, select, textarea, [href], [tabindex], [role="tab"], [role="button"], [role="link"]';
    this.show = async () => {
      var _a, _b, _c, _d;
      (_a = await pubsub.after("polyfill.dialog")) == null ? void 0 : _a(this.dialog);
      const snabModal = this.dialog.parentElement === this.dialog.closest(".snab-modal-mask");
      if (this.o.modal) this.view.scrollTop = 0;
      if (snabModal) (_b = this.dialog.parentElement) == null ? void 0 : _b.classList.remove("none");
      if (this.o.modal && !snabModal) this.dialog.showModal();
      else this.dialog.show();
      easyCloseHandler.push(this);
      this.dialogEvents.addCleanupTask(() => easyCloseHandler.remove(this));
      this.autoFocus();
      (_d = (_c = this.o).onShow) == null ? void 0 : _d.call(_c, this);
      return new Promise((resolve) => this.resolve = resolve);
    };
    this.close = (v) => {
      this.dialog.close(v || this.returnValue || "ok");
    };
    this.updateActions = (actions = this.o.actions) => {
      this.actionEvents.cleanup();
      this.o.actions = actions;
      if (!actions) return;
      for (const a2 of Array.isArray(actions) ? actions : [actions]) {
        for (const event of Array.isArray(a2.event) ? a2.event : a2.event ? [a2.event] : ["click"]) {
          for (const el of a2.selector ? this.view.querySelectorAll(a2.selector) : [this.view]) {
            const listener = "listener" in a2 ? (e) => a2.listener(e, this, a2) : () => this.close(a2.result);
            this.actionEvents.addListener(el, event, listener);
          }
        }
      }
    };
    this.onKeydown = (e) => {
      if (e.key === "Escape" && (this.o.easyClose || !this.o.noCloseButton)) {
        this.close("cancel");
        e.preventDefault();
      } else if (e.key === "Tab") {
        const focii = [...this.dialog.querySelectorAll(this.focusQuery)].filter(
          (el) => el.tabIndex !== -1 && el.checkVisibility({ visibilityProperty: true }) && !el.matches(":disabled") && !el.closest("[inert]")
        );
        focii.sort((a2, b) => {
          var _a, _b;
          const ati = Number((_a = a2.getAttribute("tabindex")) != null ? _a : "0");
          const bti = Number((_b = b.getAttribute("tabindex")) != null ? _b : "0");
          if (ati > 0 && (bti === 0 || ati < bti)) return -1;
          else if (bti > 0 && ati !== bti) return 1;
          else return a2.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
        });
        const first = focii[0], last = focii[focii.length - 1], focus = document.activeElement;
        if (focus === last && !e.shiftKey) first == null ? void 0 : first.focus();
        else if (focus === first && e.shiftKey) last == null ? void 0 : last.focus();
        else return;
        e.preventDefault();
      }
      if (["Escape", "Tab"].includes(e.key)) e.stopPropagation();
    };
    this.onRemove = () => {
      var _a, _b, _c, _d, _e;
      this.observer.disconnect();
      if (!this.dialog.returnValue) this.dialog.returnValue = "cancel";
      (_a = this.resolve) == null ? void 0 : _a.call(this, this);
      (_c = (_b = this.o).onClose) == null ? void 0 : _c.call(_b, this);
      if ((_d = this.dialog.parentElement) == null ? void 0 : _d.classList.contains("snab-modal-mask")) this.dialog.parentElement.remove();
      else this.dialog.remove();
      for (const css of (_e = this.o.css) != null ? _e : []) {
        if ("hashed" in css) site.asset.removeCssPath(css.hashed);
        else if ("url" in css) site.asset.removeCss(css.url);
      }
      this.actionEvents.cleanup();
      this.dialogEvents.cleanup();
    };
    var _a;
    this.observer.observe(document.body, { childList: true, subtree: true });
    document.body.style.setProperty("---viewport-height", `${window.innerHeight}px`);
    this.dialogEvents.addListener(view, "click", (e) => e.stopPropagation());
    this.dialogEvents.addListener(dialog, "cancel", (e) => {
      if (!o.easyClose && o.noCloseButton && o.class !== "alert") return e.preventDefault();
      if (!this.dialog.returnValue) this.dialog.returnValue = "cancel";
    });
    this.dialogEvents.addListener(dialog, "close", this.onRemove);
    if (!o.noCloseButton)
      this.dialogEvents.addListener(
        dialog.querySelector(".close-button-anchor > .close-button"),
        "click",
        () => this.close("cancel")
      );
    for (const app of (_a = o.insert) != null ? _a : []) {
      if (app.nodes === view) break;
      const nodes = Array.isArray(app.nodes) ? app.nodes : [app.nodes];
      const target = app.selector ? view.querySelector(app.selector) : view;
      if (app.position === "before") target.before(...nodes);
      else if (app.position === "after") target.after(...nodes);
      else target.append(...nodes);
    }
    this.updateActions();
    this.dialogEvents.addListener(this.dialog, "keydown", this.onKeydown);
  }
  get returnValue() {
    return this.dialog.returnValue;
  }
  autoFocus() {
    var _a;
    const focus = (_a = this.o.focus ? this.view.querySelector(this.o.focus) : this.view.querySelector("input[autofocus]")) != null ? _a : this.view.querySelector(this.focusQuery);
    if (!(focus instanceof HTMLElement)) return;
    focus.focus();
    if (focus instanceof HTMLInputElement) focus.select();
  }
};
async function loadAssets(o) {
  var _a, _b, _c, _d, _e;
  const results = await Promise.allSettled([
    o.htmlUrl ? text(o.htmlUrl) : Promise.resolve((_c = (_b = (_a = o.cash) == null ? void 0 : _a.clone().removeClass("none")[0]) == null ? void 0 : _b.outerHTML) != null ? _c : o.htmlText),
    site.asset.loadCssPath("bits.dialog"),
    ...((_d = o.css) != null ? _d : []).map(
      (css) => "hashed" in css ? site.asset.loadCssPath(css.hashed) : site.asset.loadCss(css.url)
    )
  ]);
  return ((_e = results[0]) == null ? void 0 : _e.status) === "fulfilled" && results[0].value || "";
}

// ../lib/src/view/dialogs.ts
async function alert(msg) {
  await domDialog({
    htmlText: `<div>${escapeHtmlAddBreaks(msg)}</div><span><button class="button">${i18n.site.ok}</button></span>`,
    class: "alert",
    modal: true,
    noCloseButton: true,
    show: true,
    actions: { selector: "button", result: "ok" }
  });
}
async function alerts(msgs) {
  for (const msg of msgs) await alert(msg);
}
async function info(msg, autoDismiss) {
  const dlg = await domDialog({
    htmlText: escapeHtmlAddBreaks(msg),
    noCloseButton: true,
    easyClose: "anyClick"
  });
  if (autoDismiss) setTimeout(() => dlg.close(), autoDismiss);
  return dlg.show();
}
async function confirm(msg, ok = i18n.site.ok, cancel = i18n.site.cancel) {
  const confirmDialog = await domDialog({
    htmlText: `<div>${escapeHtmlAddBreaks(msg)}</div><span><button class="button button-empty cancel">${cancel}</button><button class="button ok">${ok}</button></span>`,
    class: "alert",
    noCloseButton: true,
    modal: true,
    show: true,
    focus: ".ok",
    actions: [
      { selector: ".cancel", result: "cancel" },
      { selector: ".ok", result: "ok" }
    ]
  });
  return confirmDialog.returnValue === "ok";
}
async function prompt(msg, def = "", valid = () => true) {
  const res = await domDialog({
    htmlText: `<div>${escapeHtmlAddBreaks(msg)}</div><input type="text"${valid(def) ? "" : ' class="invalid"'} value="${escapeHtml(def)}"><span><button class="button button-empty cancel">${i18n.site.cancel}</button><button class="button ok${valid(def) ? '"' : ' disabled" disabled'}>${i18n.site.ok}</button></span>`,
    class: "alert",
    noCloseButton: true,
    modal: true,
    show: true,
    focus: "input",
    actions: [
      { selector: ".ok", result: "ok" },
      { selector: ".cancel", result: "cancel" },
      {
        selector: "input",
        event: "keydown",
        listener: (e, dlg) => {
          if (e.key !== "Enter" && e.key !== "Escape") return;
          e.preventDefault();
          if (e.key === "Enter" && valid(dlg.view.querySelector("input").value))
            dlg.close("ok");
          else if (e.key === "Escape") dlg.close("cancel");
        }
      },
      {
        selector: "input",
        event: "input",
        listener: (e, dlg) => {
          if (!(e.target instanceof HTMLInputElement)) return;
          const ok = dlg.view.querySelector(".ok");
          const invalid = !valid(e.target.value);
          e.target.classList.toggle("invalid", invalid);
          ok.classList.toggle("disabled", invalid);
          ok.disabled = invalid;
        }
      }
    ]
  });
  return res.returnValue === "ok" ? res.view.querySelector("input").value : null;
}
async function choose(msg, options, initial, mustChoose = false) {
  const res = await domDialog({
    htmlText: `<div>${escapeHtmlAddBreaks(msg)}</div><select ${initial ? 'value="' + initial + '"' : ""}>` + options.map(
      (option2) => `<option value="${escapeHtml(option2)}"${option2 === initial ? " selected" : ""}> ${escapeHtml(option2)} </option>`
    ) + `</select><span>` + (mustChoose ? "" : `<button class="button button-empty cancel">${i18n.site.cancel}</button>`) + `<button class="button ok">${i18n.site.ok}</button></span>`,
    class: "alert",
    noCloseButton: mustChoose,
    modal: true,
    show: true,
    actions: [
      {
        selector: ".ok",
        listener: (_, dlg) => {
          var _a;
          return dlg.close((_a = dlg.view.querySelector("select")) == null ? void 0 : _a.value);
        }
      },
      { selector: ".cancel", result: "cancel" }
    ]
  });
  return res.returnValue === "cancel" ? void 0 : res.returnValue;
}
var makeLinkPopups = (dom, selector = 'a[href^="http"]') => {
  const $el = $(dom);
  if (!$el.hasClass("link-popup-ready"))
    $el.addClass("link-popup-ready").on("click", selector, function() {
      return onClick(this);
    });
};
var onClick = (a2) => {
  const url = new URL(a2.href);
  if (isPassList(url)) return true;
  domDialog({
    class: "link-popup",
    css: [{ hashed: "bits.linkPopup" }],
    htmlText: `<div class="link-popup__content"><div class="link-popup__content__title"><h2>${i18n.site.youAreLeavingLichess}</h2><p class="link-popup__content__advice">${i18n.site.neverTypeYourPassword}</p></div></div><div class="link-popup__actions"><button class="cancel button-link" type="button">${i18n.site.cancel}</button><a href="${a2.href}" target="_blank" class="button button-red button-no-upper"> ${i18n.site.proceedToX(url.host)} </a></div>`,
    modal: true
  }).then((dlg) => {
    $(".cancel", dlg.view).on("click", dlg.close);
    $("a", dlg.view).on("click", () => setTimeout(dlg.close, 1e3));
    dlg.show();
  });
  return false;
};
var isPassList = (url) => passList().find((h3) => h3 === url.host || url.host.endsWith("." + h3));
var passList = () => `lichess.org lichess4545.com ligacatur.com
github.com discord.com discord.gg mastodon.online
bsky.app facebook.com twitch.tv
wikipedia.org wikimedia.org
chess24.com chess.com chessable.com
lc0.org lczero.org stockfishchess.org
`.split(/[ \n]/);
function escapeHtmlAddBreaks(s) {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

// ../lib/src/game/clock/clockWidget.ts
var formatMs = (msTime) => {
  const date = new Date(Math.max(0, msTime + 500)), hours = date.getUTCHours(), minutes = date.getUTCMinutes(), seconds = date.getUTCSeconds();
  return hours > 0 ? hours + ":" + pad(minutes) + ":" + pad(seconds) : minutes + ":" + pad(seconds);
};
var otbClockIsRunning = (fen) => !fen.includes("PPPPPPPP/RNBQKBNR");
var lichessClockIsRunning = (fen, color) => color === "white" ? !fen.includes("PPPPPPPP/RNBQKBNR") : !fen.startsWith("rnbqkbnr/pppppppp");
function setClockWidget(el, opts) {
  const instance = get(el, "clock");
  if (instance) instance.set(opts);
  else set(el, "clock", new ClockWidget(el, opts));
}
var pad = (x) => (x < 10 ? "0" : "") + x;
var ClockWidget = class {
  constructor(el, opts) {
    this.el = el;
    this.opts = opts;
    this.set = (opts) => {
      this.opts = opts;
      this.target = opts.time * 1e3 + Date.now();
      this.render();
      clearInterval(this.interval);
      if (!opts.pause) this.interval = setInterval(this.render, 1e3);
    };
    this.render = () => {
      if (document.body.contains(this.el)) {
        this.el.textContent = formatMs(this.target - Date.now());
        this.el.classList.toggle("clock--run", !this.opts.pause);
      } else clearInterval(this.interval);
    };
    this.target = opts.time * 1e3 + Date.now();
    if (!opts.pause) this.interval = setInterval(this.render, 1e3);
    this.render();
  }
};

// ../lib/src/view/miniBoard.ts
var initMiniBoard = (node) => {
  const [fen, orientation, lm] = node.getAttribute("data-state").split(",");
  initMiniBoardWith(node, { fen, orientation, lastMove: uciToMove(lm) });
};
var initMiniBoardWith = (node, config) => {
  const cgConfig = {
    coordinates: false,
    viewOnly: !node.getAttribute("data-playable"),
    drawable: { enabled: false, visible: false },
    ...config
  };
  set(node, "chessground", Chessground(node, cgConfig));
};
var initMiniBoards = (parent) => Array.from((parent || document).getElementsByClassName("mini-board--init")).forEach((el) => {
  el.classList.remove("mini-board--init");
  initMiniBoard(el);
});
var renderClock = (color, time2) => h(`span.mini-game__clock.mini-game__clock--${color}`, {
  attrs: { "data-time": time2, "data-managed": 1 }
});
var initMiniGame = (node, withCg) => {
  const [fen, color, lm] = node.getAttribute("data-state").split(","), config = {
    coordinates: false,
    viewOnly: true,
    fen,
    orientation: color,
    lastMove: uciToMove(lm),
    drawable: {
      enabled: false,
      visible: false
    }
  }, $el = $(node).removeClass("mini-game--init"), $cg = $el.find(".cg-wrap"), turnColor = fenColor(fen);
  set($cg[0], "chessground", (withCg != null ? withCg : Chessground)($cg[0], config));
  COLORS.forEach(
    (color2) => $el.find(".mini-game__clock--" + color2).each(function() {
      setClockWidget(this, {
        time: parseInt(this.getAttribute("data-time")),
        pause: color2 !== turnColor || !lichessClockIsRunning(fen, color2)
      });
    })
  );
  return node.getAttribute("data-live");
};
var getChessground = (node) => get(node, "chessground");
var initMiniGames = (parent) => {
  const nodes = Array.from((parent || document).getElementsByClassName("mini-game--init")), ids = nodes.map((x) => initMiniGame(x)).filter(Boolean);
  if (ids.length) pubsub.after("socket.hasConnected").then(() => wsSend("startWatching", ids.join(" ")));
};
var updateMiniGame = (node, data) => {
  const lm = data.lm, cg = getChessground(node.querySelector(".cg-wrap"));
  if (cg)
    cg.set({
      fen: data.fen,
      lastMove: uciToMove(lm)
    });
  const turnColor = fenColor(data.fen);
  const updateClock = (time2, color) => {
    const clockEl = node == null ? void 0 : node.querySelector(".mini-game__clock--" + color);
    if (clockEl && !isNaN(time2))
      setClockWidget(clockEl, {
        time: time2,
        pause: color !== turnColor || !lichessClockIsRunning(data.fen, color)
      });
  };
  updateClock(data.wc, "white");
  updateClock(data.bc, "black");
};
var finishMiniGame = (node, win) => COLORS.forEach((color) => {
  const clock = node.querySelector(".mini-game__clock--" + color);
  if (clock && !clock.dataset["managed"])
    $(clock).replaceWith(
      `<span class="mini-game__result">${win ? win === color[0] ? 1 : 0 : "\xBD"}</span>`
    );
});

// ../lib/src/pointer.ts
function addPointerListeners(el, listeners) {
  var _a;
  const { click, hold } = listeners;
  const g = { timer: 0, y: 0 };
  const holdDuration = (_a = listeners.holdDuration) != null ? _a : 500;
  const reset = (e) => {
    clearTimeout(g.timer);
    el.releasePointerCapture(e.pointerId);
    el.removeEventListener("pointermove", pointermove);
    g.y = g.timer = 0;
  };
  const pointerdown = (e) => {
    g.y = e.clientY;
    g.timer = window.setTimeout(() => {
      if (!hold) return;
      if (hold === "click") click == null ? void 0 : click(e);
      else hold(e);
      reset(e);
    }, holdDuration);
    el.addEventListener("pointermove", pointermove, { passive: false });
  };
  const pointermove = (e) => {
    const dy = e.clientY - g.y;
    if (Math.abs(dy) > 12) return reset(e);
  };
  const pointerup = (e) => {
    if (g.timer && click) click(e);
    reset(e);
    e.preventDefault();
  };
  el.addEventListener("pointerup", pointerup, { passive: false });
  el.addEventListener("pointerdown", pointerdown, { passive: true });
  el.addEventListener("pointercancel", reset, { passive: true });
  if (isTouchDevice() && hold) {
    el.addEventListener("contextmenu", (e) => e.preventDefault(), { passive: false });
  }
}

// ../lib/src/view/cmn-toggle.ts
var cmnToggleProp = (opts) => cmnToggle({
  ...opts,
  checked: opts.prop(),
  change: (v) => opts.prop(v)
});
var cmnToggle = (opts) => h("span.cmn-toggle", { attrs: { role: "button" } }, [
  h(`input#cmn-tg-${opts.id}`, {
    attrs: { type: "checkbox", checked: opts.checked, disabled: !!opts.disabled },
    on: {
      click: blurIfPrimaryClick
    },
    props: defined(opts.propsChecked) ? { checked: opts.propsChecked } : void 0,
    hook: bind("change", (e) => opts.change(e.target.checked), opts.redraw)
  }),
  h("label", { attrs: { for: `cmn-tg-${opts.id}` } })
]);
var cmnToggleWrapProp = (opts) => cmnToggleWrap({
  ...opts,
  checked: opts.prop(),
  change: (v) => opts.prop(v)
});
var cmnToggleWrap = (opts) => h("label.cmn-toggle-wrap", opts.title ? { attrs: { title: opts.title } } : {}, [
  cmnToggle({ ...opts, title: void 0 }),
  opts.name
]);

// ../lib/src/view/boardMenu.ts
var toggleButton = (toggle2, title) => h("button.fbt.board-menu-toggle-btn", {
  class: { active: toggle2() },
  attrs: { title, "data-icon": licon.Hamburger },
  hook: onInsert(
    (el) => addPointerListeners(el, {
      click: (e) => {
        toggle2.toggle();
        blurIfPrimaryClick(e);
      }
    })
  )
});
var boardMenu = (redraw, toggle2, content) => toggle2() ? h(
  "div.board-menu",
  { hook: onInsert(onClickAway(() => toggle2(false))) },
  content(new BoardMenu(redraw))
) : void 0;
var BoardMenu = class {
  // oxlint-disable-line no-inferrable-types The simplification collides with our TS config.
  constructor(redraw) {
    this.redraw = redraw;
    this.anonymous = !myUserId();
    this.flip = (name, active, onChange) => h(
      "button.button.text",
      {
        class: { active },
        attrs: { title: "Hotkey: f", ...dataIcon(licon.ChasingArrows) },
        hook: onInsert((el) => addPointerListeners(el, { click: onChange }))
      },
      name
    );
    this.zenMode = (enabled = true) => cmnToggleWrap({
      id: "zen",
      name: i18n.preferences.zenMode,
      checked: $("body").hasClass("zen"),
      change: () => pubsub.emit("zen"),
      disabled: !enabled,
      redraw: this.redraw
    });
    this.voiceInput = (toggle2, enabled = true) => cmnToggleWrapProp({
      id: "voice",
      name: i18n.preferences.inputMovesWithVoice,
      prop: toggle2,
      title: this.anonymous ? "Must be logged in" : "",
      disabled: this.anonymous || !enabled,
      redraw: this.redraw
    });
    this.keyboardInput = (toggle2, enabled = true) => cmnToggleWrapProp({
      id: "keyboard",
      name: i18n.preferences.inputMovesWithTheKeyboard,
      prop: toggle2,
      title: this.anonymous ? "Must be logged in" : "",
      disabled: this.anonymous || !enabled,
      redraw: this.redraw
    });
    this.blindfold = (toggle2, enabled = true) => cmnToggleWrapProp({
      id: "blindfold",
      name: i18n.preferences.blindfold,
      prop: toggle2,
      disabled: !enabled,
      redraw: this.redraw
    });
    this.confirmMove = (toggle2, enabled = true) => cmnToggleWrapProp({
      id: "confirmmove",
      name: i18n.preferences.moveConfirmation,
      prop: toggle2,
      disabled: !enabled,
      redraw: this.redraw
    });
  }
};

// ../lib/src/view/snabbdomElements.ts
var VNODE_DATA_KEYS = /* @__PURE__ */ new Set([
  "props",
  "attrs",
  "class",
  "style",
  "dataset",
  "on",
  "attachData",
  "hook",
  "key",
  "ns",
  "fn",
  "args"
]);
var MAX_CHILDREN_NEST_LEVEL = 5;
function movePropsToAttrs(data) {
  if (data == null) return null;
  let next = null;
  let attrs = null;
  for (const key of Object.keys(data)) {
    if (VNODE_DATA_KEYS.has(key)) continue;
    const value = data[key];
    if (!isAttrValue(value)) continue;
    if (next === null || attrs === null) {
      attrs = { ...data.attrs };
      next = { ...data, attrs };
    }
    attrs[key] = value;
    delete next[key];
  }
  return next != null ? next : data;
}
function isAttrValue(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
function isVNode(value) {
  return value !== null && typeof value === "object" && ("sel" in value || "text" in value || "children" in value);
}
function isVNodeData(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isVNode(value);
}
function isSelector(value) {
  return typeof value === "string" && (value.startsWith(".") || value.startsWith("#") || value.startsWith("["));
}
function normalizeArgs(a2, b) {
  if (b !== void 0) {
    if (!isVNodeData(a2) && a2 !== null) {
      throw new TypeError(
        "Invalid arguments: when passing 2 arguments, the first must be VNodeDataExtended or null"
      );
    }
    return [a2, b];
  }
  if (isVNodeData(a2) || a2 === null) {
    return [a2, []];
  }
  return [{}, a2 != null ? a2 : []];
}
function makeTag(tag, defaultData) {
  return makeExoticTag(tag, defaultData);
}
function makeExoticTag(tag, defaultData) {
  function tagFn(a2, b, c) {
    const [sel, data, children] = isSelector(a2) ? [`${tag}${a2}`, ...normalizeArgs(b, c)] : [tag, ...normalizeArgs(a2, b)];
    return h(
      sel,
      movePropsToAttrs({ ...defaultData, ...data }),
      Array.isArray(children) ? children.flat(MAX_CHILDREN_NEST_LEVEL) : children
    );
  }
  return tagFn;
}
var div = makeTag("div");
var p = makeTag("p");
var button = makeTag("button");
var span = makeTag("span");
var strong = makeTag("strong");
var time = makeTag("time");
var label = makeTag("label");
var select = makeTag("select");
var option = makeTag("option");
var main = makeTag("main");
var form2 = makeTag("form");
var h1 = makeTag("h1");
var h2 = makeTag("h2");
var table = makeTag("table");
var thead = makeTag("thead");
var tbody = makeTag("tbody");
var tr = makeTag("tr");
var th = makeTag("th");
var td = makeTag("td");
var a = (href) => makeTag("a", { href });
var img = (src, alt) => makeTag("img", { alt, src });
var input = (type = "text") => makeTag("input", { type });
var optgroup = (label2) => makeTag("optgroup", { label: label2 });
var icon = (icon2) => makeExoticTag("icon", { "data-icon": icon2 });

export {
  addPointerListeners,
  cmnToggleProp,
  cmnToggle,
  cmnToggleWrapProp,
  cmnToggleWrap,
  toggleButton,
  boardMenu,
  enter,
  toggleBoxInit,
  rangeConfig,
  boolPrefXhrToggle,
  copyMeInput,
  addPasswordVisibilityToggleListener,
  spinnerHtml,
  spinnerVdom,
  domDialog,
  snabDialog,
  alert,
  alerts,
  info,
  confirm,
  prompt,
  choose,
  makeLinkPopups,
  makeExoticTag,
  div,
  p,
  button,
  span,
  strong,
  time,
  label,
  select,
  option,
  main,
  form2 as form,
  h1,
  h2,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  a,
  img,
  input,
  optgroup,
  icon,
  formatMs,
  otbClockIsRunning,
  setClockWidget,
  initMiniBoard,
  initMiniBoardWith,
  initMiniBoards,
  renderClock,
  initMiniGame,
  initMiniGames,
  updateMiniGame,
  finishMiniGame
};
//# sourceMappingURL=lib.MYPIOGN5.js.map
