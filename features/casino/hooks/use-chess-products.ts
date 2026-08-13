"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchChessProductAccess,
  fetchChessProducts,
  purchaseChessProduct,
} from "@/features/casino/lib/api/chess-products";
import { newChessIdempotencyKey } from "@/features/casino/lib/api/chess-idempotency";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CASHIER_KEYS } from "@/features/casino/hooks/use-chess-cashier";
import type { ChessProductKey } from "@/features/casino/lib/api/types";

export const CHESS_PRODUCT_KEYS = {
  catalog: ["casino", "chess", "products", "catalog"] as const,
  access: (player: string) => ["casino", "chess", "products", "access", player] as const,
};

export function useChessProducts() {
  const queryClient = useQueryClient();
  const { ready, authenticated } = usePrivy();
  const wallet = useCasinoWallet();
  const player = wallet.address;

  const catalog = useQuery({
    queryKey: CHESS_PRODUCT_KEYS.catalog,
    queryFn: fetchChessProducts,
    staleTime: 5 * 60_000,
  });
  const access = useQuery({
    queryKey: CHESS_PRODUCT_KEYS.access(player ?? "none"),
    queryFn: () => fetchChessProductAccess(player as string),
    enabled: ready && authenticated && !!player,
    retry: false,
  });
  const purchase = useMutation({
    mutationFn: (productKey: ChessProductKey) => {
      if (!player) throw new Error("Connect your wallet first.");
      return purchaseChessProduct(player, productKey, newChessIdempotencyKey());
    },
    onSuccess: (result) => {
      queryClient.setQueryData(CHESS_PRODUCT_KEYS.access(result.player), result.access);
      void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(result.player) });
    },
  });

  return {
    products: catalog.data ?? [],
    access: access.data ?? null,
    isLoading: catalog.isLoading || (ready && authenticated && !!player && access.isLoading),
    error: catalog.error ?? access.error,
    purchase: purchase.mutateAsync,
    purchasing: purchase.isPending,
    purchasingKey: purchase.variables ?? null,
  };
}
