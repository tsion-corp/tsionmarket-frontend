const ESM_PATHS: Record<string, string> = {
  "chart.game": "/compiled/chart.game.GQXPTJCY.js",
  "analyse.gifDialog": "/compiled/analyse.gifDialog.EVB36PMG.js",
  "analyse.nvui": "/compiled/analyse.nvui.AJO3TH4Z.js",
  "voice.move": "/compiled/voice.move.FKEXI2WL.js",
  "voice.vosk": "/compiled/voice.vosk.NRDKBVQB.js",
};

const CSS_PATHS: Record<string, string> = {
  "voice.move.help": "/css/voice.move.help.621e5f43.css",
};

const CHESS_ASSET_PREFIX = "chess-assets/v1";

export const lichessRoundStyles = [
  "/css/lib.theme.all.ca09c987.css",
  "/css/site.5a4b7c75.css",
  "/css/round.fb9194ff.css",
  "/css/voice.21b8d714.css",
] as const;

export function lichessEsmPath(key: string): string | undefined {
  return ESM_PATHS[key];
}

export function lichessCssPath(key: string): string {
  return CSS_PATHS[key] ?? `/css/${key}.css`;
}

export function resolveLichessPublicAssetPath(path: string, baseUrl?: string): string {
  const normalized = path.replace(/^\//u, "");
  const localPath =
    normalized.startsWith("lifat/") || normalized.startsWith("chess/lichess/")
      ? `/${normalized.startsWith("chess/lichess/") ? normalized : `chess/lichess/${normalized}`}`
      : `/${normalized}`;

  if (!baseUrl || normalized.startsWith("compiled/grammar/")) return localPath;

  const objectPath =
    normalized.startsWith("npm/") || normalized.startsWith("chess/lichess/")
      ? normalized
      : `chess/lichess/${normalized}`;
  return `${baseUrl.replace(/\/+$/u, "")}/${CHESS_ASSET_PREFIX}/${objectPath}`;
}

export function lichessPublicAssetPath(path: string): string {
  return resolveLichessPublicAssetPath(path, process.env.NEXT_PUBLIC_CHESS_ASSET_BASE_URL);
}
