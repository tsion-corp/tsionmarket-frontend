import {
  flash
} from "./lib.WB3RHOLH.js";
import {
  Switch
} from "./lib.E2LEIDPC.js";
import {
  cmnToggleProp,
  snabDialog
} from "./lib.MYPIOGN5.js";
import {
  bind,
  dataIcon,
  hl,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  jsonSimple
} from "./lib.TT4QSUKQ.js";
import {
  objectStorage,
  once,
  storedBooleanProp,
  storedBooleanPropWithEffect,
  storedStringProp,
  storedStringPropWithEffect
} from "./lib.NFSQQWN5.js";
import {
  onClickAway,
  propWithEffect,
  toggle
} from "./lib.GMEH5BEF.js";

// ../voice/src/languages.ts
var supportedLangs = [
  ["en", "English"],
  ["fr", "Fran\xE7ais"],
  ["pl", "Polski"]
];
if (site.debug)
  supportedLangs.push(
    ["de", "Deutsch"],
    ["tr", "T\xFCrk\xE7e"],
    ["vi", "Ti\u1EBFng Vi\u1EC7t"],
    ["ru", "\u0420\u0443\u0441\u0441\u043A\u0438\u0439"],
    ["it", "Italiano"],
    ["sv", "Svenska"]
  );

// ../voice/src/view.ts
function renderVoiceBar(ctrl, redraw, cls) {
  var _a;
  return hl(`div#voice-bar${cls ? "." + cls : ""}`, [
    hl("div#voice-status-row", [
      hl("button#microphone-button", {
        hook: onInsert((el) => el.addEventListener("click", () => ctrl.toggle()))
      }),
      hl("span#voice-status", {
        hook: onInsert((el) => ctrl.mic.setController(voiceBarUpdater(ctrl, el)))
      }),
      hl("button#voice-help-button", {
        attrs: { ...dataIcon(licon.InfoCircle), title: "Voice help" },
        hook: bind("click", () => ctrl.showHelp(true), void 0, false)
      }),
      hl("button#voice-settings-button", {
        attrs: { ...dataIcon(licon.Gear), title: "Voice settings" },
        class: { active: ctrl.showPrefs() },
        hook: bind("click", () => ctrl.showPrefs.toggle(), redraw, false)
      })
    ]),
    ctrl.showPrefs() && hl("div#voice-settings", { hook: onInsert(onClickAway(() => ctrl.showPrefs(false))) }, [
      deviceSelector(ctrl, redraw),
      langSetting(ctrl),
      (_a = ctrl.module()) == null ? void 0 : _a.prefNodes(redraw),
      pushTalkSetting(ctrl)
    ]),
    ctrl.showHelp() && renderHelpModal(ctrl)
  ]);
}
function voiceBarUpdater(ctrl, el) {
  const voiceBtn = $("button#microphone-button");
  return (txt, tpe) => {
    voiceBtn.toggleClass("listening", ctrl.mic.isListening);
    voiceBtn.toggleClass("error", tpe === "error");
    voiceBtn.toggleClass("push-to-talk", ctrl.pushTalk() && !ctrl.mic.isListening && !ctrl.mic.isBusy);
    voiceBtn.html(ctrl.mic.isBusy ? '<span class="ddloader"></span>' : "");
    if (ctrl.mic.isBusy) voiceBtn.removeAttr("data-icon");
    else voiceBtn.attr("data-icon", tpe === "error" ? licon.Cancel : licon.Voice);
    if (tpe !== "partial") el.innerText = txt;
  };
}
function pushTalkSetting(ctrl) {
  return hl("div.voice-setting", [
    hl("label.cmn-toggle-wrap", { attrs: { title: "Hold the shift key while speaking" } }, [
      cmnToggleProp({ id: "wake-mode", prop: ctrl.pushTalk }),
      "Push ",
      hl("strong", "shift"),
      " key to talk"
    ])
  ]);
}
function langSetting(ctrl) {
  return supportedLangs.length > 1 && hl("div.voice-setting", [
    hl("label", { attrs: { for: "voice-lang" } }, "Language"),
    hl(
      "select#voice-lang",
      {
        attrs: { name: "lang" },
        hook: bind("change", (e) => ctrl.lang(e.target.value))
      },
      supportedLangs.map(
        (l) => hl(
          "option",
          { attrs: l[0] === ctrl.lang() ? { value: l[0], selected: "" } : { value: l[0] } },
          l[1]
        )
      )
    )
  ]);
}
var nullMic = {
  deviceId: "null",
  label: "None selected",
  groupId: "",
  kind: "audioinput",
  toJSON: () => "[]"
};
var devices = [nullMic];
function deviceSelector(ctrl, redraw) {
  return hl("div.voice-setting", [
    hl("label", { attrs: { for: "voice-mic" } }, "Microphone"),
    hl(
      "select#voice-mic",
      {
        hook: onInsert((el) => {
          el.addEventListener("change", () => ctrl.micId(el.value));
          ctrl.mic.getMics().then((ds) => {
            devices = ds.length ? ds : [nullMic];
            redraw();
          });
        })
      },
      devices.map(
        (d) => hl(
          "option",
          {
            attrs: {
              value: d.deviceId,
              selected: d.deviceId === ctrl.micId()
            }
          },
          d.label
        )
      )
    )
  ]);
}
function renderHelpModal(ctrl) {
  const showMoveList = (dlg) => {
    var _a, _b, _c;
    let html = '<table class="big-table"><tbody>';
    const all = (_c = (_b = (_a = ctrl.module()) == null ? void 0 : _a.allPhrases()) == null ? void 0 : _b.sort((a, b) => a[0].localeCompare(b[0]))) != null ? _c : [];
    const cols = Math.min(3, Math.ceil(window.innerWidth / 399));
    const rows = Math.ceil(all.length / cols);
    for (let row = 0; row < rows; row++) {
      html += "<tr>";
      for (let i = row; i < all.length; i += rows) {
        html += `<td>${all[i][0]}</td><td>${all[i][1]}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    dlg.view.innerHTML = html;
    if (!dlg.dialog.open) dlg.show();
  };
  return snabDialog({
    class: "help.voice-move-help",
    htmlUrl: `/help/voice/${ctrl.moduleId}`,
    css: [{ hashed: "voice.move.help" }],
    onClose: () => ctrl.showHelp(false),
    modal: true,
    easyClose: "clickOutside",
    onInsert: async (dlg) => {
      if (ctrl.showHelp() === "list") {
        showMoveList(dlg);
        return;
      }
      const grammar = ctrl.moduleId === "coords" ? [] : await jsonSimple(site.asset.url(`compiled/grammar/${ctrl.moduleId}-${ctrl.lang()}.json`)).catch(
        () => ({ entries: [] })
      );
      const valToWord = (val, phonetic) => {
        var _a;
        return (_a = grammar.entries.find(
          (e) => {
            var _a2, _b;
            return ((_a2 = e.val) != null ? _a2 : e.tok) === val && (!phonetic || ((_b = e.tags) == null ? void 0 : _b.includes("phonetic")));
          }
        )) == null ? void 0 : _a.in;
      };
      $(".val-to-word", dlg.view).each(function() {
        const tryPhonetic = (val) => this.classList.contains("phonetic") && valToWord(val, true) || valToWord(val, false);
        this.innerText = this.innerText.split(",").map((v) => tryPhonetic(v)).join(" ");
      });
      $(".all-phrases-button", dlg.view).on("click", () => showMoveList(dlg));
      dlg.show();
    }
  });
}

// ../voice/src/mic.ts
var Mic = class {
  constructor() {
    this.recId = "default";
    this.language = "en";
    this.deviceId = storedStringProp("voice.micDeviceId", "default");
    this.recs = new Switch();
    this.ctrl = () => {
    };
    this.ctrlState = ["", "status"];
    this.voskStatus = "";
    this.busy = false;
    this.interrupt = false;
    this.paused = 0;
    this.soundListener = (event) => {
      switch (event) {
        case "start":
          return this.pause();
        case "stop":
          return this.resume();
      }
    };
  }
  get lang() {
    return this.language;
  }
  setLang(lang) {
    if (lang === this.language) return;
    this.stop();
    this.language = lang;
  }
  async getMics() {
    return navigator.mediaDevices.enumerateDevices().then((d) => d.filter((d2) => d2.kind === "audioinput" && d2.label));
  }
  get micId() {
    return this.deviceId();
  }
  setMic(id) {
    var _a;
    const listening = this.isListening;
    this.stop();
    this.deviceId(id);
    this.recs.close();
    (_a = this.audioCtx) == null ? void 0 : _a.close();
    this.audioCtx = void 0;
    if (listening) this.start();
  }
  setController(ctrl) {
    this.ctrl = ctrl;
    this.ctrl(...this.ctrlState);
  }
  addListener(listener, also = {}) {
    var _a, _b;
    const recId = (_a = also.recId) != null ? _a : "default";
    if (!this.recs.items.has(recId)) throw `No recognizer for '${recId}'`;
    this.recs.items.get(recId).listenerMap.set((_b = also.listenerId) != null ? _b : recId, listener);
  }
  removeListener(listenerId) {
    this.recs.items.forEach((v) => v.listenerMap.delete(listenerId));
  }
  initRecognizer(words, also = {}) {
    var _a, _b;
    if (words.length === 0) {
      this.recs.remove(also.recId);
      return;
    }
    const recId = (_a = also.recId) != null ? _a : "default";
    const rec = new RecNode(words.slice(), !!also.partial);
    if ((_b = this.vosk) == null ? void 0 : _b.isLoaded(this.lang)) this.initKaldi(recId, rec);
    this.recs.add(recId, rec);
    if (also.listener) this.addListener(also.listener, { recId, listenerId: also.listenerId });
  }
  setRecognizer(recId = "default") {
    var _a;
    this.recId = recId;
    if (!this.isListening) return;
    this.recs.set(recId);
    (_a = this.vosk) == null ? void 0 : _a.select(recId);
  }
  async start(listen = true) {
    var _a;
    try {
      if (listen && this.isListening && this.recId === this.recs.key) return;
      this.busy = true;
      await this.initModel();
      if (!this.busy) throw "";
      for (const [recId, rec] of this.recs.items) this.initKaldi(recId, rec);
      this.recs.set(listen && this.recId);
      (_a = this.vosk) == null ? void 0 : _a.select(listen && this.recId);
      this.micTrack.enabled = listen;
      this.busy = false;
      site.sound.listeners.add(this.soundListener);
      this.broadcast(listen ? "Listening..." : "", "start");
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") this.stop(["No permission", "error"]);
      else this.stop([e.toString(), "error"]);
      if (e !== "") throw e;
    }
  }
  stop(reason = ["", "stop"]) {
    var _a, _b;
    site.sound.listeners.delete(this.soundListener);
    if (this.micTrack) this.micTrack.enabled = false;
    (_a = this.download) == null ? void 0 : _a.abort();
    this.download = void 0;
    this.paused = 0;
    this.busy = false;
    this.recs.set(false);
    (_b = this.vosk) == null ? void 0 : _b.select(false);
    this.broadcast(...reason);
  }
  get isListening() {
    var _a;
    return !!this.recs.value && !!(((_a = this.micTrack) == null ? void 0 : _a.enabled) || this.paused) && !this.isBusy;
  }
  get isBusy() {
    return this.busy;
  }
  get status() {
    return this.voskStatus;
  }
  stopPropagation() {
    this.interrupt = true;
  }
  get micTrack() {
    var _a;
    return (_a = this.mediaStream) == null ? void 0 : _a.getAudioTracks()[0];
  }
  initKaldi(recId, rec) {
    var _a;
    if (rec.node) return;
    rec.node = (_a = this.vosk) == null ? void 0 : _a.initRecognizer({
      recId,
      audioCtx: this.audioCtx,
      partial: rec.partial,
      words: rec.words,
      broadcast: this.broadcast.bind(this)
    });
  }
  async initModel() {
    var _a, _b;
    if ((_a = this.vosk) == null ? void 0 : _a.isLoaded(this.lang)) {
      await this.initAudio();
      return;
    }
    this.broadcast("Loading...");
    const modelUrl = site.asset.url(models.get(this.lang));
    const downloadAsync = this.downloadModel(`/vosk/${modelUrl.replace(/[\W]/g, "_")}`);
    const audioAsync = this.initAudio();
    (_b = this.vosk) != null ? _b : this.vosk = await site.asset.loadEsm("voice.vosk");
    await downloadAsync;
    await this.vosk.initModel(modelUrl, this.lang);
    await audioAsync;
  }
  async initAudio() {
    var _a, _b;
    if (((_a = this.audioCtx) == null ? void 0 : _a.state) === "suspended") await this.audioCtx.resume();
    if (((_b = this.audioCtx) == null ? void 0 : _b.state) === "running") return;
    else if (this.audioCtx) throw `Error ${this.audioCtx.state}`;
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        sampleRate: { ideal: 16e3 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        deviceId: this.micId
      }
    });
    this.audioCtx = new AudioContext({
      sampleRate: this.mediaStream.getAudioTracks()[0].getSettings().sampleRate
    });
    this.micSource = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.recs.setContext({ source: this.micSource, ctx: this.audioCtx });
  }
  broadcast(text, msgType = "status", forMs = 0) {
    var _a, _b;
    this.ctrlState = [text, msgType];
    this.ctrl(text, msgType);
    if (msgType === "status" || msgType === "full") window.clearTimeout(this.broadcastTimeout);
    this.voskStatus = text;
    for (const li of (_b = (_a = this.recs.items.get(this.recId)) == null ? void 0 : _a.listeners) != null ? _b : []) {
      if (!this.interrupt) li(text, msgType);
    }
    this.interrupt = false;
    this.broadcastTimeout = forMs > 0 ? window.setTimeout(() => this.broadcast(""), forMs) : void 0;
  }
  async downloadModel(emscriptenPath) {
    const voskStore = await objectStorage({
      db: "/vosk",
      store: "FILE_DATA",
      version: 21,
      upgrade: (_, idbStore) => {
        idbStore == null ? void 0 : idbStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    });
    if (await voskStore.count(`${emscriptenPath}/extracted.ok`) > 0) return;
    const modelBlob = await new Promise((resolve, reject) => {
      this.download = new XMLHttpRequest();
      this.download.open("GET", site.asset.url(models.get(this.lang)), true);
      this.download.responseType = "arraybuffer";
      this.download.onerror = (_) => reject(new Error("Failed. See console"));
      this.download.onabort = (_) => reject(new Error("Aborted"));
      this.download.onprogress = (e) => {
        this.broadcast(
          e.total <= 0 ? "Downloading..." : `Downloaded ${Math.round(100 * e.loaded / e.total)}% of ${Math.round(e.total / 1e6)}MB`
        );
      };
      this.download.onload = (_) => {
        var _a, _b, _c;
        if (((_a = this.download) == null ? void 0 : _a.status) !== 200) reject(new Error(`${(_b = this.download) == null ? void 0 : _b.status} Failed`));
        else resolve((_c = this.download) == null ? void 0 : _c.response);
      };
      this.download.send();
    });
    this.broadcast("Extracting...");
    const now = /* @__PURE__ */ new Date();
    await voskStore.put(emscriptenPath, { timestamp: now, mode: 16877 });
    await voskStore.put(`${emscriptenPath}/downloaded.ok`, {
      contents: new Uint8Array([]),
      timestamp: now,
      mode: 33206
    });
    await voskStore.remove(`${emscriptenPath}/downloaded.tar.gz`);
    await voskStore.put(`${emscriptenPath}/downloaded.tar.gz`, {
      contents: new Uint8Array(modelBlob),
      timestamp: now,
      mode: 33188
    });
    voskStore.txn("readwrite").objectStore("FILE_DATA").index("timestamp");
  }
  // pause/resume use a counter so calls must be balanced.
  // short duration interruptions, use start/stop otherwise
  pause() {
    var _a;
    if (++this.paused !== 1 || !((_a = this.micTrack) == null ? void 0 : _a.enabled)) return;
    this.micTrack.enabled = false;
  }
  resume() {
    this.paused = Math.min(this.paused - 1, 0);
    if (this.paused !== 0 || this.micTrack === void 0) return;
    this.micTrack.enabled = !!this.recs.value;
  }
};
var models = /* @__PURE__ */ new Map([
  ["ca", "lifat/vosk/model-ca-0.4.tar.gz"],
  ["cn", "lifat/vosk/model-cn-0.22.tar.gz"],
  ["cs", "lifat/vosk/model-cs-0.4.tar.gz"],
  ["de", "lifat/vosk/model-de-0.15.tar.gz"],
  ["en", "lifat/vosk/model-en-us-0.15.tar.gz"],
  ["eo", "lifat/vosk/model-eo-0.42.tar.gz"],
  ["es", "lifat/vosk/model-es-0.42.tar.gz"],
  ["fa", "lifat/vosk/model-fa-0.4.tar.gz"],
  ["fr", "lifat/vosk/model-fr-0.22.tar.gz"],
  ["hi", "lifat/vosk/model-hi-0.22.tar.gz"],
  ["it", "lifat/vosk/model-it-0.22.tar.gz"],
  ["ja", "lifat/vosk/model-ja-0.22.tar.gz"],
  ["ko", "lifat/vosk/model-ko-0.22.tar.gz"],
  ["kz", "lifat/vosk/model-kz-0.15.tar.gz"],
  ["nl", "lifat/vosk/model-nl-0.22.tar.gz"],
  ["pl", "lifat/vosk/model-pl-0.22.tar.gz"],
  ["pt", "lifat/vosk/model-pt-0.3.tar.gz"],
  ["ru", "lifat/vosk/model-ru-0.22.tar.gz"],
  ["tr", "lifat/vosk/model-tr-0.3.tar.gz"],
  ["uk", "lifat/vosk/model-uk-v3.tar.gz"],
  ["uz", "lifat/vosk/model-uz-0.22.tar.gz"],
  ["vi", "lifat/vosk/model-vi-0.4.tar.gz"]
]);
var RecNode = class {
  constructor(words, partial) {
    this.listenerMap = /* @__PURE__ */ new Map();
    this.words = words;
    this.partial = partial;
  }
  select(audio) {
    if (!(audio == null ? void 0 : audio.source) || !this.node) return;
    audio.source.connect(this.node);
    this.node.connect(audio.ctx.destination);
  }
  deselect() {
    var _a;
    (_a = this.node) == null ? void 0 : _a.disconnect();
  }
  close() {
    this.node = void 0;
  }
  get listeners() {
    return [...this.listenerMap.values()].reverse();
  }
};

// ../voice/src/voice.ts
function makeVoice(opts) {
  let keyupTimeout;
  let shiftDown = false;
  const mic = new Mic();
  const enabled = storedBooleanProp("voice.on", false);
  const showHelp = propWithEffect(false, opts.redraw);
  const pushTalk = storedBooleanPropWithEffect("voice.pushTalk", false, (val) => {
    mic.stop();
    enabled(val);
    if (enabled()) mic.start(!val);
  });
  const lang = storedStringPropWithEffect("voice.lang", "en", (code) => {
    var _a;
    if (code === mic.lang) return;
    mic.setLang(code);
    (_a = opts.module) == null ? void 0 : _a.call(opts).initGrammar().then(() => {
      if (enabled()) mic.start(!pushTalk());
    });
  });
  mic.setLang(lang());
  document.addEventListener("keydown", (e) => {
    var _a;
    if (e.key !== "Shift" || shiftDown) return;
    shiftDown = true;
    (_a = window.speechSynthesis) == null ? void 0 : _a.cancel();
    if (pushTalk()) mic.start();
    clearTimeout(keyupTimeout);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key !== "Shift") return;
    shiftDown = false;
    if (!pushTalk()) return;
    clearTimeout(keyupTimeout);
    keyupTimeout = setTimeout(() => mic.stop(), 600);
  });
  if (pushTalk()) mic.start(false);
  else if (enabled()) mic.start(true);
  return {
    mic,
    lang,
    micId,
    enabled,
    toggle: toggle2,
    showHelp,
    pushTalk,
    flash,
    showPrefs: toggle(false, opts.redraw),
    module: () => {
      var _a;
      return (_a = opts.module) == null ? void 0 : _a.call(opts);
    },
    moduleId: opts.tpe
  };
  function toggle2() {
    if (pushTalk()) {
      enabled(false);
      pushTalk(false);
    } else enabled(!enabled()) ? mic.start() : mic.stop();
    if (opts.tpe === "move" && once("voice.rtfm")) showHelp(true);
  }
  function micId(deviceId) {
    if (deviceId) mic.setMic(deviceId);
    return mic.micId;
  }
}
function makeVoiceMove(ctrl, initial) {
  let move;
  const voice = makeVoice({ redraw: ctrl.redraw, module: () => move, tpe: "move" });
  site.asset.loadEsm("voice.move", { init: { root: ctrl, voice, initial } }).then((x) => move = x);
  return {
    ctrl: voice,
    initGrammar: () => move == null ? void 0 : move.initGrammar(),
    update: (up) => move == null ? void 0 : move.update(up),
    listenForResponse: (key, action) => move == null ? void 0 : move.listenForResponse(key, action),
    question: () => move == null ? void 0 : move.question(),
    promotionHook: () => move == null ? void 0 : move.promotionHook(),
    allPhrases: () => move == null ? void 0 : move.allPhrases(),
    prefNodes: () => move == null ? void 0 : move.prefNodes()
  };
}

export {
  renderVoiceBar,
  makeVoice,
  makeVoiceMove
};
//# sourceMappingURL=lib.ZW2QUNR4.js.map
