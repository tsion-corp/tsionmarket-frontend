"use client";

import { toast as sonner } from "sonner";

// Options forwarded to the underlying library. Kept minimal so the toast
// provider can change without touching call sites.
export interface ToastOptions {
  id?: string | number;
  duration?: number;
}

// Single seam for app notifications. Components call these instead of the
// library so the toast provider can change without touching call sites.
export const toast = {
  success(message: string, options?: ToastOptions) {
    sonner.success(message, options);
  },
  error(message: string, options?: ToastOptions) {
    sonner.error(message, options);
  },
  warning(message: string, options?: ToastOptions) {
    sonner.warning(message, options);
  },
  info(message: string, options?: ToastOptions) {
    sonner.info(message, options);
  },
  dismiss(id?: string | number) {
    sonner.dismiss(id);
  },
};
