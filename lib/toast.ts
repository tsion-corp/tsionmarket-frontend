"use client";

import { toast as sonner } from "sonner";

// Options forwarded to the underlying library. Kept minimal so the toast
// provider can change without touching call sites.
export interface ToastOptions {
  id?: string | number;
  duration?: number;
  /**
   * This toast shows money, a balance or a wallet address.
   *
   * WRITING A NEW TOAST: a toast is rendered in a portal outside the page, so
   * the `data-sensitive` markers that blur balances during a live broadcast do
   * NOT reach it. A toast that names an amount will be broadcast in full
   * unless it says so here.
   *
   * The rule: if the message interpolates an amount, a balance, a payout or an
   * address, pass `sensitive: true`. If it does not, leave it off. Prefer
   * wording that needs no number at all where the number adds nothing
   * ("Transfer sent" rather than "Transfer of 4 USDC sent"); pass this flag
   * when the number IS the confirmation, which is the usual case for money
   * actually moving.
   */
  sensitive?: boolean;
}

// Blurred with the rest of the financial data while a broadcast is running.
// The class is inert at every other time.
const SENSITIVE_CLASS = "ws-toast-sensitive";

function forward(options?: ToastOptions) {
  if (!options) return undefined;
  const { sensitive, ...rest } = options;
  return sensitive ? { ...rest, className: SENSITIVE_CLASS } : rest;
}

// Single seam for app notifications. Components call these instead of the
// library so the toast provider can change without touching call sites.
export const toast = {
  // Shows a spinner toast and returns its id. Pass that id to success/error to
  // update the same toast in place, so a tx reads as one processing -> done
  // notification instead of two stacked toasts.
  loading(message: string, options?: ToastOptions) {
    return sonner.loading(message, forward(options));
  },
  success(message: string, options?: ToastOptions) {
    sonner.success(message, forward(options));
  },
  error(message: string, options?: ToastOptions) {
    sonner.error(message, forward(options));
  },
  warning(message: string, options?: ToastOptions) {
    sonner.warning(message, forward(options));
  },
  info(message: string, options?: ToastOptions) {
    sonner.info(message, forward(options));
  },
  dismiss(id?: string | number) {
    sonner.dismiss(id);
  },
};
