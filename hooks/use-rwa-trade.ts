"use client";

import { useMutation } from "@tanstack/react-query";
import {
  buildRwaAction,
  fetchRwaQuote,
  type RwaAction,
  type RwaQuoteRequest,
  type RwaQuoteResult,
} from "@/lib/rwa-api";

export function useRwaQuote() {
  return useMutation<RwaQuoteResult, Error, RwaQuoteRequest>({
    mutationFn: fetchRwaQuote,
  });
}

export function useRwaBuild() {
  return useMutation<RwaAction, Error, RwaQuoteRequest & { taker: string; simulate?: boolean }>({
    mutationFn: buildRwaAction,
  });
}
