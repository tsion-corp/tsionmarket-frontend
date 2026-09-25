// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  captureDisplayProfileFromUrl,
  clearDisplayProfile,
  readDisplayProfile,
  rememberDisplayProfile,
} from "@/lib/display-profile";

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("display profile store", () => {
  it("holds nothing until a sign-in remembers something", () => {
    expect(readDisplayProfile()).toBeNull();
  });

  it("merges instead of replacing, so email sign-in keeps a Google name", () => {
    rememberDisplayProfile({ name: "Ada Lovelace", picture: "https://p/x.png" });
    rememberDisplayProfile({ email: "ada@example.com" });

    expect(readDisplayProfile()).toEqual({
      name: "Ada Lovelace",
      picture: "https://p/x.png",
      email: "ada@example.com",
    });
  });

  it("forgets everything on clear", () => {
    rememberDisplayProfile({ name: "Ada" });
    clearDisplayProfile();
    expect(readDisplayProfile()).toBeNull();
  });
});

describe("captureDisplayProfileFromUrl", () => {
  it("captures the profile params Decane's redirect carries", () => {
    window.history.replaceState(
      {},
      "",
      "/auth?decane_jwt=jwt&decane_name=Ada%20Lovelace&decane_email=ada%40example.com&decane_picture=https%3A%2F%2Fp%2Fa.png"
    );

    captureDisplayProfileFromUrl();

    expect(readDisplayProfile()).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      picture: "https://p/a.png",
    });
  });

  it("ignores profile params without a sign-in token", () => {
    window.history.replaceState({}, "", "/auth?decane_name=Mallory");
    captureDisplayProfileFromUrl();
    expect(readDisplayProfile()).toBeNull();
  });

  it("stores nothing when the sign-in returned no profile", () => {
    window.history.replaceState({}, "", "/auth?decane_jwt=jwt");
    captureDisplayProfileFromUrl();
    expect(readDisplayProfile()).toBeNull();
  });
});
