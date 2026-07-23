"use client";

import { toast as sonner } from "sonner";

// Single seam for app notifications. Components call these instead of the
// library so the toast provider can change without touching call sites.
export const toast = {
  success(message: string) {
    sonner.success(message);
  },
  error(message: string) {
    sonner.error(message);
  },
  info(message: string) {
    sonner.info(message);
  },
};
