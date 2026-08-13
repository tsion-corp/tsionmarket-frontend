import { beforeEach, describe, expect, it, vi } from "vitest";

const chessClient = vi.hoisted(() => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
}));

vi.mock("@/features/casino/lib/api/chess-client", () => chessClient);

import {
  fetchChessProductAccess,
  fetchChessProducts,
  purchaseChessProduct,
} from "@/features/casino/lib/api/chess-products";

beforeEach(() => vi.clearAllMocks());

describe("chess products api", () => {
  it("reads the public catalog and private player access", async () => {
    chessClient.chessGet
      .mockResolvedValueOnce({ items: [{ key: "hint_credit", priceUsdc: "3" }] })
      .mockResolvedValueOnce({ player: "0xplayer", hintCredits: 1 });

    await fetchChessProducts();
    await fetchChessProductAccess("0xplayer/with space");

    expect(chessClient.chessGet).toHaveBeenNthCalledWith(1, "/products");
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(
      2,
      "/players/0xplayer%2Fwith%20space/product-access",
      undefined,
      { requireAuth: true }
    );
  });

  it("purchases a credit with the backend's camel-case contract", async () => {
    chessClient.chessPost.mockResolvedValue({ id: "purchase-1" });

    await purchaseChessProduct("0xplayer", "premium_review_credit", "purchase-key-1");

    expect(chessClient.chessPost).toHaveBeenCalledWith("/products/purchase", {
      player: "0xplayer",
      productKey: "premium_review_credit",
      idempotencyKey: "purchase-key-1",
    });
  });
});
