import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("route error boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the error it caught", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("render crashed");

    render(<ErrorPage error={error} reset={() => {}} />);

    expect(log).toHaveBeenCalledWith(error);
  });
});
