import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const shared = {
  globals: true,
  setupFiles: ["./vitest.setup.ts"],
  exclude: ["node_modules", ".next", "out", "build", "casino-service", "reference"],
  passWithNoTests: true,
};

const aliases = {
  "@": resolve(__dirname, "."),
  // The Next.js boundary guard throws on import outside a server
  // component; tests exercise server modules directly, so it is stubbed.
  "server-only": resolve(__dirname, "vitest.server-only-stub.ts"),
};

// Two projects, one per environment. Booting jsdom cost more than running the
// tests did (180 s of environment time against 22 s of tests), and most .ts
// suites never touch the DOM. Component tests (.tsx) get jsdom; a .ts test
// that needs window, document or storage declares
// `// @vitest-environment jsdom` at its top and vitest honours it per file.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    ...shared,
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          environmentOptions: { jsdom: { url: "http://localhost:3000" } },
          include: ["**/*.{test,spec}.tsx"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          environmentOptions: { jsdom: { url: "http://localhost:3000" } },
          include: ["**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
