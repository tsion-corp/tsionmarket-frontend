import {
  Switch
} from "./lib.E2LEIDPC.js";
import "./lib.KO2KTNGK.js";

// ../../../../../node_modules/.pnpm/@lichess-org+vosk-browser@0.0.3/node_modules/@lichess-org/vosk-browser/dist/vosk.wasm.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
var getRandomValues;
var rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
    getRandomValues = crypto.getRandomValues.bind(crypto);
  }
  return getRandomValues(rnds8);
}
var randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var native_default = { randomUUID };
function v4(options, buf, offset) {
  var _a, _b, _c;
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = (_c = (_b = options.random) != null ? _b : (_a = options.rng) == null ? void 0 : _a.call(options)) != null ? _c : rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;
var ClientMessage;
((ClientMessage2) => {
  function isTerminateMessage(message) {
    return (message == null ? void 0 : message.action) === "terminate";
  }
  ClientMessage2.isTerminateMessage = isTerminateMessage;
  function isLoadMessage(message) {
    return (message == null ? void 0 : message.action) === "load";
  }
  ClientMessage2.isLoadMessage = isLoadMessage;
  function isSetMessage(message) {
    return (message == null ? void 0 : message.action) === "set";
  }
  ClientMessage2.isSetMessage = isSetMessage;
  function isAudioChunkMessage(message) {
    return (message == null ? void 0 : message.action) === "audioChunk";
  }
  ClientMessage2.isAudioChunkMessage = isAudioChunkMessage;
  function isRecognizerCreateMessage(message) {
    return (message == null ? void 0 : message.action) === "create";
  }
  ClientMessage2.isRecognizerCreateMessage = isRecognizerCreateMessage;
  function isRecognizerRetrieveFinalResultMessage(message) {
    return (message == null ? void 0 : message.action) === "retrieveFinalResult";
  }
  ClientMessage2.isRecognizerRetrieveFinalResultMessage = isRecognizerRetrieveFinalResultMessage;
  function isRecognizerRemoveMessage(message) {
    return (message == null ? void 0 : message.action) === "remove";
  }
  ClientMessage2.isRecognizerRemoveMessage = isRecognizerRemoveMessage;
})(ClientMessage || (ClientMessage = {}));
var ModelMessage;
((ModelMessage2) => {
  function isLoadResult(message) {
    return (message == null ? void 0 : message.event) === "load";
  }
  ModelMessage2.isLoadResult = isLoadResult;
})(ModelMessage || (ModelMessage = {}));
var ServerMessage;
((ServerMessage2) => {
  function isRecognizerMessage(message) {
    return ["result", "partialresult"].includes(message.event) || Reflect.has(message, "recognizerId");
  }
  ServerMessage2.isRecognizerMessage = isRecognizerMessage;
  function isResult(message) {
    var _a, _b;
    return ((_a = message == null ? void 0 : message.result) == null ? void 0 : _a.text) != null || ((_b = message == null ? void 0 : message.result) == null ? void 0 : _b.result) != null;
  }
  ServerMessage2.isResult = isResult;
  function isPartialResult(message) {
    var _a;
    return ((_a = message == null ? void 0 : message.result) == null ? void 0 : _a.partial) != null;
  }
  ServerMessage2.isPartialResult = isPartialResult;
})(ServerMessage || (ServerMessage = {}));
var Logger = class {
  constructor(logLevel = 0) {
    this.logLevel = 0;
    this.setLogLevel(logLevel);
  }
  getLogLevel() {
    return this.logLevel;
  }
  setLogLevel(level) {
    if (typeof level != "number") return;
    this.logLevel = level;
  }
  error(message) {
    console.error(message);
  }
  warn(message) {
    if (this.logLevel < -1) return;
    console.warn(message);
  }
  info(message) {
    if (this.logLevel < 0) return;
    console.info(message);
  }
  verbose(message) {
    if (this.logLevel < 1) return;
    console.debug(message);
  }
  debug(message) {
    if (this.logLevel < 3) return;
    console.debug(message);
  }
};
var VoskClient = class extends EventTarget {
  constructor(opts) {
    var _a, _b, _c;
    super();
    this.isReady = false;
    this.logger = new Logger();
    this.recognizers = /* @__PURE__ */ new Map();
    this.logger.setLogLevel((_a = opts.logLevel) != null ? _a : 0);
    this.worker = new Worker((_b = opts.workerUrl) != null ? _b : "./vosk.worker.js", { type: "module" });
    this.worker.addEventListener("message", (event) => this.handleMessage(event));
    this.postMessage({
      action: "set",
      key: "logLevel",
      value: this.logger.getLogLevel()
    });
    this.postMessage({
      action: "load",
      wasmUrl: (_c = opts.wasmUrl) != null ? _c : "./vosk.wasm",
      modelUrl: opts.modelUrl
    });
  }
  postMessage(message, options) {
    this.worker.postMessage(message, options);
  }
  handleMessage(event) {
    const message = event.data;
    if (message) {
      if (ModelMessage.isLoadResult(message)) {
        this.isReady = message.result;
      }
      const event2 = new CustomEvent(message.event, { detail: message });
      if (ServerMessage.isRecognizerMessage(message) && message.recognizerId) {
        const recognizer = this.recognizers.get(message.recognizerId);
        if (recognizer) {
          recognizer.dispatchEvent(event2);
          return;
        }
      }
      this.dispatchEvent(event2);
    }
  }
  on(event, listener) {
    this.addEventListener(event, (event2) => {
      if (event2.detail && !ServerMessage.isRecognizerMessage(event2.detail)) {
        listener(event2.detail);
      }
    });
  }
  registerPort(port) {
    this.logger.debug(`Registering port ${port}`);
    this.messagePort = port;
    this.messagePort.onmessage = this.forwardMessage.bind(this);
  }
  forwardMessage(event) {
    const message = event.data;
    if (ClientMessage.isAudioChunkMessage(message)) {
      this.postMessage(message, {
        transfer: [message.data.buffer]
      });
    }
  }
  get ready() {
    return this.isReady;
  }
  terminate() {
    this.postMessage({
      action: "terminate"
    });
    this.isReady = false;
  }
  setLogLevel(level) {
    this.logger.setLogLevel(level);
    this.postMessage({
      action: "set",
      key: "logLevel",
      value: level
    });
  }
  registerRecognizer(recognizer) {
    this.recognizers.set(recognizer.id, recognizer);
  }
  unregisterRecognizer(recognizerId) {
    this.recognizers.delete(recognizerId);
  }
  get KaldiRecognizer() {
    const model = this;
    return class extends EventTarget {
      constructor(sampleRate, grammar) {
        super();
        this.id = v4_default();
        if (!model.ready) {
          throw new Error("Cannot create KaldiRecognizer. Model is either not ready or has been terminated");
        }
        model.registerRecognizer(this);
        model.postMessage({
          action: "create",
          recognizerId: this.id,
          sampleRate,
          grammar
        });
      }
      on(event, listener) {
        this.addEventListener(event, (event2) => {
          listener(event2 == null ? void 0 : event2.detail);
        });
      }
      setWords(words) {
        model.postMessage({
          action: "set",
          recognizerId: this.id,
          key: "words",
          value: words
        });
      }
      acceptWaveform(buffer) {
        if (buffer.numberOfChannels < 1) {
          throw new Error(`AudioBuffer should contain at least one channel`);
        }
        this.acceptWaveformFloat(buffer.getChannelData(0), buffer.sampleRate);
      }
      acceptWaveformFloat(buffer, sampleRate) {
        const data = buffer.map((value) => value * 32768);
        if (!(data instanceof Float32Array)) {
          throw new Error(`Channel data is not a Float32Array as expected: ${data}`);
        }
        model.logger.debug(
          `Recognizer (id: ${this.id}): Sending audioChunk 0=${data[0]} ${data.length}=${data[data.length - 1]}`
        );
        model.postMessage(
          {
            action: "audioChunk",
            data,
            recognizerId: this.id,
            sampleRate
          },
          {
            transfer: [data.buffer]
          }
        );
      }
      retrieveFinalResult() {
        model.postMessage({
          action: "retrieveFinalResult",
          recognizerId: this.id
        });
      }
      remove() {
        model.unregisterRecognizer(this.id);
        model.postMessage({
          action: "remove",
          recognizerId: this.id
        });
      }
    };
  }
};
async function createVoskClient(opts) {
  const model = new VoskClient(opts);
  return new Promise(
    (resolve, reject) => model.on("load", (message) => {
      if (message.result) {
        resolve(model);
      }
      reject();
    })
  );
}

// ../voice/src/voice.vosk.ts
var LOG_LEVEL = -1;
function initModule() {
  const recs = new Switch();
  let voskClient;
  let lang;
  return {
    initModel,
    initRecognizer,
    isLoaded,
    select
  };
  async function initModel(url, language) {
    voskClient == null ? void 0 : voskClient.terminate();
    recs.remove();
    voskClient = await createVoskClient({
      modelUrl: url,
      workerUrl: site.asset.url("npm/vosk/vosk.worker.js", { documentOrigin: true }),
      wasmUrl: site.asset.url("npm/vosk/vosk.wasm"),
      logLevel: LOG_LEVEL
    });
    lang = language;
  }
  function initRecognizer(opts) {
    var _a;
    if (!((_a = opts.words) == null ? void 0 : _a.length) || !voskClient) {
      recs.remove(opts.recId);
      return void 0;
    }
    const kaldi = new voskClient.KaldiRecognizer(opts.audioCtx.sampleRate, JSON.stringify(opts.words));
    const bufSize = 2 ** Math.ceil(Math.log2(opts.audioCtx.sampleRate / (opts.partial ? 16 : 8)));
    const node = opts.audioCtx.createScriptProcessor(bufSize, 1, 1);
    if (opts.partial)
      kaldi.on("partialresult", (msg) => {
        if (msg.result.partial.length > 0) opts.broadcast(msg.result.partial, "partial", 0);
      });
    else
      kaldi.on("result", (msg) => {
        if (msg.result.text.length > 0) opts.broadcast(msg.result.text, "full", 3e3);
      });
    if (LOG_LEVEL >= -1)
      console.info(
        `Created ${opts.audioCtx.sampleRate.toFixed(0)}Hz recognizer '${opts.recId}' with buffer size ${bufSize}`,
        opts.words
      );
    recs.add(opts.recId, new KaldiRec(kaldi, node, opts.partial));
    return node;
  }
  function isLoaded(language) {
    return voskClient !== void 0 && (!language || language === lang);
  }
  function select(recId) {
    recs.set(recId);
  }
}
var KaldiRec = class {
  constructor(kaldi, node, partial) {
    this.kaldi = kaldi;
    this.node = node;
    this.partial = partial;
  }
  select() {
    if (this.node.onaudioprocess) return;
    this.node.onaudioprocess = (e) => this.kaldi.acceptWaveform(e.inputBuffer);
  }
  deselect() {
    if (!this.node.onaudioprocess) return;
    this.kaldi.retrieveFinalResult();
    this.node.onaudioprocess = null;
  }
  close() {
    this.deselect();
    this.kaldi.remove();
  }
};
export {
  initModule
};
//# sourceMappingURL=voice.vosk.NRDKBVQB.js.map
