import { promises as fs } from "node:fs";
import path from "node:path";
import { compileAsync, Logger } from "sass-embedded";

const root = process.cwd();
const chessUi = path.join(root, "features/casino/components/chess");
const themeDir = path.join(chessUi, "lib/css/theme");
const generatedDir = path.join(themeDir, "gen");
const generatedWrap = path.join(generatedDir, "_wrap.scss");
const input = path.join(chessUi, "puzzle/css/build/puzzle.scss");
const output = path.join(root, "public/css/ark-puzzle.css");

const colorVariables = new Set();
for (const name of await fs.readdir(themeDir)) {
  if (!name.startsWith("_theme.") || !name.endsWith(".scss")) continue;
  const source = await fs.readFile(path.join(themeDir, name), "utf8");
  for (const line of source.split("\n")) {
    if (!line.includes("--c-")) continue;
    const colon = line.indexOf(":");
    const comment = line.indexOf("//");
    if (colon < 0 || (comment >= 0 && comment < colon)) continue;
    colorVariables.add(line.slice(0, colon).trim().replace(/^--/u, ""));
  }
}

const wrap = [...colorVariables]
  .sort()
  .map((variable) => `$${variable}: var(--${variable});`)
  .join("\n");

await fs.mkdir(generatedDir, { recursive: true });
await fs.writeFile(generatedWrap, `${wrap}\n`);

try {
  const result = await compileAsync(input, {
    style: "compressed",
    sourceMap: false,
    quietDeps: true,
    silenceDeprecations: ["import"],
    logger: Logger.silent,
  });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.css);
} finally {
  await fs.rm(generatedWrap, { force: true });
  await fs.rmdir(generatedDir).catch(() => undefined);
}
