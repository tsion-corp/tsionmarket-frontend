import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The casino service is a separate Node package with its own tooling.
    "casino-service/**",
    // Design handoff bundles are reference material, not code we lint.
    "design_handoff_*/**",
    // Vendored Stockfish worker build (GPLv3, shipped as a static asset).
    "public/stockfish/**",
  ]),
]);

export default eslintConfig;
