import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareToSquare, type ShareDraft } from "./share-to-square";

const createPost = vi.fn();
vi.mock("@/lib/api/market-square", () => ({
  createPost: (...args: unknown[]) => createPost(...args),
}));
vi.mock("@/lib/market-square", () => ({ marketSquareHref: () => "https://square.test" }));

const draft: ShareDraft = {
  title: "Closed a BTC position",
  subtitle: "Spot",
  deepLink: { kind: "trade", ref: "spot:BTC:1" },
  amount: "1,240 USDC",
};

beforeEach(() => {
  createPost.mockReset();
  createPost.mockResolvedValue({ post: { id: "p1" }, previewShared: true });
});

describe("ShareToSquare", () => {
  it("posts nothing until the user asks, and sends the card with their words", async () => {
    render(<ShareToSquare draft={draft} open onClose={() => {}} />);
    expect(createPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "good exit" } });
    fireEvent.click(screen.getByText("Post"));

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost).toHaveBeenCalledWith({
      text: "good exit",
      deepLink: draft.deepLink,
      preview: { title: draft.title, subtitle: "Spot", imageUrl: undefined },
    });
  });

  // On a trading platform the figure is the sensitive part, so it rides along
  // only when the user says so — after seeing exactly what it will say.
  it("leaves the amount out unless it is opted into", async () => {
    render(<ShareToSquare draft={draft} open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Post"));

    await waitFor(() => expect(createPost).toHaveBeenCalled());
    expect(createPost.mock.calls[0][0].preview.subtitle).toBe("Spot · 1,240 USDC");
  });

  it("says when the card did not make it, rather than implying it did", async () => {
    createPost.mockResolvedValue({ post: { id: "p1" }, previewShared: false });
    render(<ShareToSquare draft={draft} open onClose={() => {}} />);
    fireEvent.click(screen.getByText("Post"));

    await waitFor(() => expect(screen.getByText(/posted the link only/)).toBeTruthy());
  });

  it("reports a failure as a failure, so nothing looks shared that is not", async () => {
    createPost.mockRejectedValue(new Error("network"));
    render(<ShareToSquare draft={draft} open onClose={() => {}} />);
    fireEvent.click(screen.getByText("Post"));

    await waitFor(() => expect(screen.getByText(/Nothing was posted/)).toBeTruthy());
  });
});
