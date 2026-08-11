"use client";

import { createInterfaceMode } from "@/features/trade/components/interface-mode";

export const { useMode: useMemeMode, ModeSwitch: MemeModeSwitch } =
  createInterfaceMode("wsws.meme-mode.v1");
