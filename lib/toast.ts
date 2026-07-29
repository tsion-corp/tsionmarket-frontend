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
  // Shows a spinner toast and returns its id. Pass that id to success/error to
  // update the same toast in place, so a tx reads as one processing -> done
  // notification instead of two stacked toasts.
  loading(message: string, options?: ToastOptions) {
    return sonner.loading(message, options);
  },
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
