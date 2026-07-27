import { it, expect } from "vitest";
it("probes localStorage", () => {
  console.log("typeof window", typeof window);
  console.log("window.localStorage", window.localStorage);
  console.log("globalThis.localStorage", globalThis.localStorage);
  console.log("descriptor", Object.getOwnPropertyDescriptor(window, "localStorage"));
  expect(true).toBe(true);
});
