"use client";

import { createInterfaceMode } from "@/components/dashboard/trade/interface-mode";

export const { useMode: useMemeMode, ModeSwitch: MemeModeSwitch } =
  createInterfaceMode("wsws.meme-mode.v1");
