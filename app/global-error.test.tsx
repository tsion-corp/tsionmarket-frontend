import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

describe("root error boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the error it caught", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("layout crashed");

    render(<GlobalError error={error} />);

    expect(log).toHaveBeenCalledWith(error);
  });
});
