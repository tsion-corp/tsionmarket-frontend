type BoardColor = "white" | "black";

export type AnalysisExportFrame = {
  fen: string;
  uci?: string;
  annotation?: string;
  whiteClock?: number | null;
  blackClock?: number | null;
};

export type AnalysisExportOptions = {
  orientation: BoardColor;
  whiteName: string;
  blackName: string;
  whiteRating?: number | null;
  blackRating?: number | null;
  players: boolean;
  ratings: boolean;
  glyphs: boolean;
  clocks: boolean;
};

const PIECE_NAMES: Record<string, string> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

const pieceImages = new Map<string, Promise<HTMLImageElement>>();

function pieceImage(piece: string): Promise<HTMLImageElement> {
  const side = piece === piece.toUpperCase() ? "w" : "b";
  const source = `/piece/cburnett/${side}${PIECE_NAMES[piece.toLowerCase()]}.svg`;
  const cached = pieceImages.get(source);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${source}`));
    image.src = source;
  });
  pieceImages.set(source, pending);
  return pending;
}

function position(fen: string): Array<{ piece: string; file: number; rank: number }> {
  const rows = fen.split(" ")[0]?.split("/") ?? [];
  const pieces: Array<{ piece: string; file: number; rank: number }> = [];
  rows.forEach((row, rank) => {
    let file = 0;
    for (const token of row) {
      if (/\d/.test(token)) file += Number(token);
      else {
        pieces.push({ piece: token, file, rank });
        file += 1;
      }
    }
  });
  return pieces;
}

function squarePoint(square: string, orientation: BoardColor, squareSize: number) {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - Number(square[1]);
  return orientation === "white"
    ? { x: file * squareSize, y: rank * squareSize }
    : { x: (7 - file) * squareSize, y: (7 - rank) * squareSize };
}

function clockText(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

async function drawFrame(
  context: CanvasRenderingContext2D,
  frame: AnalysisExportFrame,
  options: AnalysisExportOptions,
  size: number
): Promise<void> {
  const labelHeight = options.players ? Math.max(28, Math.round(size * 0.07)) : 0;
  const boardSize = size;
  const squareSize = boardSize / 8;
  const topColor = options.orientation === "white" ? "black" : "white";
  const bottomColor = topColor === "white" ? "black" : "white";
  const label = (color: BoardColor) => {
    const name = color === "white" ? options.whiteName : options.blackName;
    const rating = color === "white" ? options.whiteRating : options.blackRating;
    return options.ratings && rating ? `${name} (${rating})` : name;
  };
  const clock = (color: BoardColor) =>
    clockText(color === "white" ? frame.whiteClock : frame.blackClock);

  context.fillStyle = "#262421";
  context.fillRect(0, 0, size, size + labelHeight * 2);
  if (labelHeight) {
    context.font = `600 ${Math.max(13, Math.round(labelHeight * 0.48))}px sans-serif`;
    context.textBaseline = "middle";
    context.fillStyle = "#d0ccc5";
    context.textAlign = "left";
    context.fillText(label(topColor), 10, labelHeight / 2);
    context.fillText(label(bottomColor), 10, labelHeight + boardSize + labelHeight / 2);
    if (options.clocks) {
      context.textAlign = "right";
      context.fillStyle = "#f0ede7";
      context.fillText(clock(topColor), size - 10, labelHeight / 2);
      context.fillText(clock(bottomColor), size - 10, labelHeight + boardSize + labelHeight / 2);
    }
  }

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      context.fillStyle = (file + rank) % 2 === 0 ? "#f0d9b5" : "#b58863";
      context.fillRect(file * squareSize, labelHeight + rank * squareSize, squareSize, squareSize);
    }
  }

  if (frame.uci && frame.uci.length >= 4) {
    context.fillStyle = "rgba(255, 214, 56, 0.42)";
    for (const square of [frame.uci.slice(0, 2), frame.uci.slice(2, 4)]) {
      const point = squarePoint(square, options.orientation, squareSize);
      context.fillRect(point.x, labelHeight + point.y, squareSize, squareSize);
    }
  }

  await Promise.all(
    position(frame.fen).map(async ({ piece, file, rank }) => {
      const image = await pieceImage(piece);
      const x = options.orientation === "white" ? file : 7 - file;
      const y = options.orientation === "white" ? rank : 7 - rank;
      context.drawImage(
        image,
        x * squareSize,
        labelHeight + y * squareSize,
        squareSize,
        squareSize
      );
    })
  );

  if (options.glyphs && frame.annotation && frame.uci && frame.uci.length >= 4) {
    const point = squarePoint(frame.uci.slice(2, 4), options.orientation, squareSize);
    context.beginPath();
    context.arc(
      point.x + squareSize * 0.79,
      labelHeight + point.y + squareSize * 0.2,
      squareSize * 0.16,
      0,
      Math.PI * 2
    );
    context.fillStyle = "#d59020";
    context.fill();
    context.fillStyle = "#fff";
    context.font = `700 ${Math.round(squareSize * 0.22)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      frame.annotation,
      point.x + squareSize * 0.79,
      labelHeight + point.y + squareSize * 0.2
    );
  }
}

function palette332(): Uint8Array {
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = Math.round(((index >> 5) / 7) * 255);
    palette[index * 3 + 1] = Math.round((((index >> 2) & 7) / 7) * 255);
    palette[index * 3 + 2] = Math.round(((index & 3) / 3) * 255);
  }
  return palette;
}

function indexed332(data: Uint8ClampedArray): Uint8Array {
  const indexed = new Uint8Array(data.length / 4);
  for (let source = 0, target = 0; source < data.length; source += 4, target += 1) {
    indexed[target] =
      (data[source] & 0xe0) | ((data[source + 1] & 0xe0) >> 3) | (data[source + 2] >> 6);
  }
  return indexed;
}

function lzw(indices: Uint8Array): Uint8Array {
  const clearCode = 256;
  const endCode = 257;
  let bits = 0;
  let bitCount = 0;
  const output: number[] = [];
  const write = (code: number) => {
    bits |= code << bitCount;
    bitCount += 9;
    while (bitCount >= 8) {
      output.push(bits & 0xff);
      bits >>>= 8;
      bitCount -= 8;
    }
  };

  // Literal runs with regular clear codes are larger than dictionary-compressed
  // output, but they are deterministic and remain at the 9-bit code width. This
  // avoids encoder/decoder dictionary drift that made Safari render white GIFs.
  write(clearCode);
  let runLength = 0;
  for (const index of indices) {
    write(index);
    runLength += 1;
    if (runLength === 250) {
      write(clearCode);
      runLength = 0;
    }
  }
  write(endCode);
  if (bitCount) output.push(bits & 0xff);
  return Uint8Array.from(output);
}

class GifBytes {
  private readonly bytes: number[] = [];

  push(...values: number[]) {
    this.bytes.push(...values);
  }

  text(value: string) {
    for (const character of value) this.bytes.push(character.charCodeAt(0));
  }

  word(value: number) {
    this.push(value & 0xff, (value >> 8) & 0xff);
  }

  block(value: Uint8Array) {
    for (let offset = 0; offset < value.length; offset += 255) {
      const chunk = value.subarray(offset, offset + 255);
      this.push(chunk.length, ...chunk);
    }
    this.push(0);
  }

  blob() {
    return new Blob([Uint8Array.from(this.bytes)], { type: "image/gif" });
  }
}

function gifHeader(bytes: GifBytes, width: number, height: number) {
  bytes.text("GIF89a");
  bytes.word(width);
  bytes.word(height);
  bytes.push(0xf7, 0, 0);
  bytes.push(...palette332());
  bytes.push(0x21, 0xff, 0x0b);
  bytes.text("NETSCAPE2.0");
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);
}

function gifFrame(
  bytes: GifBytes,
  indices: Uint8Array,
  width: number,
  height: number,
  delay: number
) {
  bytes.push(0x21, 0xf9, 0x04, 0x04);
  bytes.word(delay);
  bytes.push(0, 0);
  bytes.push(0x2c);
  bytes.word(0);
  bytes.word(0);
  bytes.word(width);
  bytes.word(height);
  bytes.push(0, 8);
  bytes.block(lzw(indices));
}

export async function renderPositionPng(
  frame: AnalysisExportFrame,
  options: AnalysisExportOptions,
  size = 640
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const labelHeight = options.players ? Math.max(28, Math.round(size * 0.07)) : 0;
  canvas.width = size;
  canvas.height = size + labelHeight * 2;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable");
  await drawFrame(context, frame, options, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Unable to render board image"))),
      "image/png"
    )
  );
}

export async function renderGameGif(
  frames: AnalysisExportFrame[],
  options: AnalysisExportOptions,
  onProgress?: (completed: number, total: number) => void
): Promise<Blob> {
  const size = 384;
  const labelHeight = options.players ? Math.max(28, Math.round(size * 0.07)) : 0;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + labelHeight * 2;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");

  const selected =
    frames.length <= 120
      ? frames
      : frames.filter((_, index) => index === 0 || index === frames.length - 1 || index % 2 === 0);
  const bytes = new GifBytes();
  gifHeader(bytes, canvas.width, canvas.height);
  for (let index = 0; index < selected.length; index += 1) {
    await drawFrame(context, selected[index], options, size);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    gifFrame(
      bytes,
      indexed332(pixels),
      canvas.width,
      canvas.height,
      index === selected.length - 1 ? 180 : 70
    );
    onProgress?.(index + 1, selected.length);
    if (index % 4 === 3)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  bytes.push(0x3b);
  return bytes.blob();
}
