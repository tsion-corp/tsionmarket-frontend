"use client";

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";
import type {
  ChessProductAccess,
  ChessProductCatalogItem,
  ChessProductKey,
  ChessProductPurchase,
} from "@/features/casino/lib/api/types";

interface ProductCatalogWire {
  items: ChessProductCatalogItem[];
}

export async function fetchChessProducts(): Promise<ChessProductCatalogItem[]> {
  const catalog = await chessGet<ProductCatalogWire>("/products");
  return catalog.items;
}

export function fetchChessProductAccess(player: string): Promise<ChessProductAccess> {
  return chessGet<ChessProductAccess>(
    `/players/${encodeURIComponent(player)}/product-access`,
    undefined,
    { requireAuth: true }
  );
}

export function purchaseChessProduct(
  player: string,
  productKey: ChessProductKey,
  idempotencyKey: string
): Promise<ChessProductPurchase> {
  return chessPost<ChessProductPurchase>("/products/purchase", {
    player,
    productKey,
    idempotencyKey,
  });
}
