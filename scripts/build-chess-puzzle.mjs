import { promises as fs } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const chessSourceRoot = path.resolve("features/casino/components/chess");

function condenseLiterals(text) {
  const backtick = "`".charCodeAt(0);
  const nextLiteral = (from) => {
    for (let i = text.indexOf("$", from); i >= 0; i = text.indexOf("$", i + 1)) {
      if (text.charCodeAt(i + 5) !== backtick) continue;
      if (text.startsWith("html", i + 1)) return [i + 6, true];
      if (text.startsWith("trim", i + 1)) return [i + 6, false];
    }
    return undefined;
  };
  const condense = (value, isHtml) =>
    isHtml
      ? value.trim().replace(/\s+/g, " ").replace(/>\s+</g, "><")
      : value
          .trim()
          .replace(/(?:\n[ \t]*){2,}/g, "\n\n")
          .replace(/\n[ \t]+/g, " ");

  const output = [];
  let cursor = 0;
  for (let literal = nextLiteral(cursor); literal; literal = nextLiteral(++cursor)) {
    const [beginLiteral, isHtml] = literal;
    output.push(text.slice(cursor, beginLiteral - 6));
    for (
      cursor = text.indexOf("`", beginLiteral);
      cursor !== -1 && text[cursor - 1] === "\\";
      cursor = text.indexOf("`", cursor + 1)
    ) {
      let backslashes = 1;
      for (let i = cursor - 2; text[i] === "\\" && i >= beginLiteral; i--) backslashes++;
      if ((backslashes & 1) === 0) break;
    }
    if (cursor === -1) {
      cursor = beginLiteral - 1;
      break;
    }
    output.push("`", condense(text.slice(beginLiteral, cursor), isHtml), "`");
  }
  if (cursor === 0) return text;
  output.push(text.slice(cursor));
  return output.join("");
}

await build({
  entryPoints: ["features/casino/components/chess/puzzle/src/puzzle.ts"],
  outfile: "public/compiled/ark-puzzle.js",
  bundle: true,
  format: "esm",
  target: "es2018",
  conditions: ["source"],
  alias: {
    "keyboard-move": path.join(chessSourceRoot, "keyboardMove/src/exports.ts"),
    lib: path.join(chessSourceRoot, "lib/src"),
    voice: path.join(chessSourceRoot, "voice/src/voice.ts"),
  },
  plugins: [
    {
      name: "lichess-condense-literals",
      setup(context) {
        context.onLoad({ filter: /\.ts$/ }, async ({ path: sourcePath }) => ({
          loader: "ts",
          contents: condenseLiterals(await fs.readFile(sourcePath, "utf8")),
          resolveDir: path.dirname(sourcePath),
        }));
      },
    },
  ],
});
