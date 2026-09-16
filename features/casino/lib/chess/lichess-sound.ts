import { lichessPublicAssetPath } from "./lichess-assets";

type SoundMoveOptions = {
  filter?: "game" | "music";
  name?: string;
  san?: string;
  volume?: number;
};

type AudioContextConstructor = new () => AudioContext;

const soundAssetPath = (path: string): string =>
  lichessPublicAssetPath(`chess/lichess/sound/${path}`);
const SILENCE_PATH = soundAssetPath("Silence.mp3");
const STANDARD_SOUNDS = new Set([
  "berserk",
  "capture",
  "confirmation",
  "countDown0",
  "countDown1",
  "countDown2",
  "countDown3",
  "countDown4",
  "countDown5",
  "countDown6",
  "countDown7",
  "countDown8",
  "countDown9",
  "countDown10",
  "error",
  "explosion",
  "genericNotify",
  "lowTime",
  "move",
  "outOfBound",
  "select",
  "socialNotify",
]);

function titleCase(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export function resolveLichessSoundPath(theme: string, name: string): string | undefined {
  if (theme === "silent") return undefined;
  if (theme === "standard" && !STANDARD_SOUNDS.has(name)) return SILENCE_PATH;
  const directory = theme === "music" ? "standard" : theme;
  return soundAssetPath(`${directory}/${titleCase(name)}.mp3`);
}

export function lichessBoardSoundName(san?: string): string[] {
  const names = [san?.includes("x") ? "capture" : "move"];
  if (san?.includes("#")) names.push("checkmate");
  else if (san?.includes("+")) names.push("check");
  return names;
}

class DecodedSound {
  private context: AudioContext;
  private gain: GainNode;

  constructor(
    context: AudioContext,
    private readonly buffer: AudioBuffer
  ) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.connect(context.destination);
  }

  rewire(context: AudioContext): void {
    this.gain.disconnect();
    this.context = context;
    this.gain = context.createGain();
    this.gain.connect(context.destination);
  }

  play(volume: number): Promise<void> {
    this.gain.gain.setValueAtTime(volume, this.context.currentTime);
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    return new Promise((resolve) => {
      source.onended = () => {
        source.disconnect();
        resolve();
      };
      source.start(0);
    });
  }
}

function makeAudioContext(): AudioContext | undefined {
  const audioWindow = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const Constructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  return Constructor ? new Constructor() : undefined;
}

async function decodeAudio(context: AudioContext, input: ArrayBuffer): Promise<AudioBuffer> {
  if (context.decodeAudioData.length === 1) return context.decodeAudioData(input);
  return new Promise((resolve, reject) => context.decodeAudioData(input, resolve, reject));
}

class LichessSoundRuntime {
  readonly __arkLichessSound = true;
  private context?: AudioContext;
  private contextPromise?: Promise<AudioContext | undefined>;
  readonly listeners = new Set<(event: "start" | "stop", text?: string) => void>();
  private readonly paths = new Map<string, string>();
  private readonly sounds = new Map<string, Promise<DecodedSound | undefined>>();
  private readonly primerEvents = ["touchend", "pointerup", "pointerdown", "mousedown", "keydown"];
  private theme: string;
  private throttleTimer?: ReturnType<typeof setTimeout>;
  private lastBoardSoundAt = 0;

  constructor() {
    this.theme = document.body.dataset.soundSet || "standard";
    for (const event of this.primerEvents) {
      window.addEventListener(event, this.primer, { capture: true });
    }
  }

  private getContext(): Promise<AudioContext | undefined> {
    this.contextPromise ??= Promise.resolve().then(() => {
      this.context = makeAudioContext();
      return this.context;
    });
    return this.contextPromise;
  }

  private primer = async (): Promise<void> => {
    const context = await this.getContext();
    if (context?.state === "suspended") await context.resume();
    for (const event of this.primerEvents) {
      window.removeEventListener(event, this.primer, { capture: true });
    }
  };

  private async resume(): Promise<boolean> {
    let context = await this.getContext();
    if (!context) return false;
    if (context.state !== "running" && context.state !== "suspended") {
      if (context.state !== "closed") await context.close();
      context = makeAudioContext();
      this.context = context;
      this.contextPromise = Promise.resolve(context);
      if (!context) return false;
      for (const sound of this.sounds.values()) {
        const decoded = await sound;
        decoded?.rewire(context);
      }
    }
    if (context.state === "suspended") await context.resume();
    return context.state === "running";
  }

  resolvePath(name: string): string | undefined {
    if (!this.enabled()) return undefined;
    if (this.theme === "music" || this.speech()) {
      if (["move", "capture", "check", "checkmate"].includes(name)) return undefined;
    }
    return resolveLichessSoundPath(this.theme, name);
  }

  url(name: string): string {
    return soundAssetPath(name);
  }

  async load(name: string, explicitPath?: string): Promise<DecodedSound | undefined> {
    if (explicitPath) this.paths.set(name, explicitPath);
    const path = explicitPath ?? this.paths.get(name) ?? this.resolvePath(name);
    if (!path || path === SILENCE_PATH) return undefined;
    const cached = this.sounds.get(path);
    if (cached) return cached;

    const loading = this.getContext().then(async (context) => {
      if (!context) return undefined;
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path} failed ${response.status}`);
      const buffer = await decodeAudio(context, await response.arrayBuffer());
      return new DecodedSound(context, buffer);
    });
    this.sounds.set(path, loading);
    try {
      return await loading;
    } catch (error) {
      this.sounds.delete(path);
      throw error;
    }
  }

  async play(name: string, volume = 1): Promise<void> {
    try {
      const sound = await this.load(name);
      if (sound && (await this.resume())) await sound.play(this.getVolume() * volume);
    } catch (error) {
      console.error(`Unable to play Lichess sound ${name}`, error);
    }
  }

  private throttled(name: string, volume: number): void {
    const elapsed = performance.now() - this.lastBoardSoundAt;
    const run = () => {
      this.lastBoardSoundAt = performance.now();
      void this.play(name, volume);
    };
    if (elapsed >= 100) {
      if (this.throttleTimer) clearTimeout(this.throttleTimer);
      this.throttleTimer = undefined;
      run();
      return;
    }
    if (this.throttleTimer) clearTimeout(this.throttleTimer);
    this.throttleTimer = setTimeout(run, 100 - elapsed);
  }

  move(options?: SoundMoveOptions): void {
    if (options?.filter === "music" || this.theme === "music") return;
    const names = options?.name ? [options.name] : lichessBoardSoundName(options?.san);
    for (const name of names) this.throttled(name, options?.volume ?? 1);
  }

  playAndDelayMateResultIfNecessary(name: string): void {
    if (this.theme === "standard") void this.play(name);
    else setTimeout(() => void this.play(name), 600);
  }

  async countdown(count: number, interval = 500): Promise<void> {
    while (this.enabled() && count > 0) {
      await Promise.all([
        new Promise((resolve) => setTimeout(resolve, interval)),
        this.play(`countDown${count}`),
      ]);
      count--;
    }
    if (this.enabled()) await this.play("genericNotify");
  }

  playOnce(name: string): void {
    const previous = Number.parseInt(localStorage.getItem("just-played") ?? "0", 10);
    if (Date.now() - previous < 2_000) return;
    localStorage.setItem("just-played", String(Date.now()));
    void this.play(name);
  }

  setVolume = (value: string): void => {
    localStorage.setItem("sound-volume", value);
  };

  getVolume = (): number => {
    const value = Number.parseFloat(localStorage.getItem("sound-volume") ?? "");
    return value >= 0 ? value : 0.7;
  };

  enabled = (): boolean => this.theme !== "silent" && this.getVolume() !== 0;

  speech = (value?: boolean): boolean => {
    if (value !== undefined) localStorage.setItem("speech.enabled", String(value));
    return localStorage.getItem("speech.enabled") === "true";
  };

  private getVoice(): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    const stored = localStorage.getItem("speech.voice");
    if (stored) {
      try {
        const selected = JSON.parse(stored) as { lang?: string; name?: string };
        const exact = voices.find((voice) => voice.name === selected.name);
        if (exact) return exact;
        if (selected.lang) {
          const language = voices.find((voice) => voice.lang.startsWith(selected.lang!));
          if (language) return language;
        }
      } catch (error) {
        console.error("Unable to read the selected Lichess speech voice", error);
      }
    }
    const language = document.documentElement.lang || navigator.language || "en-GB";
    return voices.find((voice) => voice.lang.startsWith(language.split("-")[0]));
  }

  say(text: string, cut = false, force = false, translated = false): boolean {
    return this.sayLazy(() => text, cut, force, translated);
  }

  sayLazy(text: () => string, cut = false, force = false, translated = false): boolean {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    if (!this.speech() && !force) return false;
    try {
      if (cut) window.speechSynthesis.cancel();
      const content = text();
      const message = new SpeechSynthesisUtterance(content);
      const voice = this.getVoice();
      if (voice) message.voice = voice;
      else message.lang = translated ? document.documentElement.lang : "en-GB";
      message.volume = this.getVolume();
      message.onstart = () => {
        for (const listener of this.listeners) listener("start", content);
      };
      message.onend = message.onerror = () => {
        for (const listener of this.listeners) listener("stop");
      };
      window.speechSynthesis.speak(message);
      return true;
    } catch (error) {
      console.error("Unable to speak Lichess voice output", error);
      return false;
    }
  }

  saySan(san?: string, cut = false, force = false): boolean {
    const text = san
      ?.replace("O-O-O", "castle queenside")
      .replace("O-O", "castle kingside")
      .replace(/^K/u, "king ")
      .replace(/^Q/u, "queen ")
      .replace(/^R/u, "rook ")
      .replace(/^B/u, "bishop ")
      .replace(/^N/u, "knight ")
      .replace("x", " takes ")
      .replace("+", " check")
      .replace("#", " checkmate");
    return this.say(text ?? "", cut, force);
  }

  sayOrPlay(name: string, text: string, cut = false): boolean | Promise<void> {
    return this.say(text, cut) || this.play(name);
  }

  changeSet(theme: string): void {
    this.theme = theme;
    document.body.dataset.soundSet = theme;
  }

  preloadBoardSounds(): void {
    for (const name of ["move", "capture", "check", "checkmate", "genericNotify"]) {
      void this.load(name).catch((error) => {
        console.error(`Unable to preload Lichess sound ${name}`, error);
      });
    }
  }
}

export type LichessSound = LichessSoundRuntime;

export function createLichessSound(): LichessSound {
  return new LichessSoundRuntime();
}

export function isLichessSound(value: unknown): value is LichessSound {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { __arkLichessSound?: unknown }).__arkLichessSound === true
  );
}
