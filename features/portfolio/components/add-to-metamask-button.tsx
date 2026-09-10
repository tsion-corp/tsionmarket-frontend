"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { useKashStatus } from "@/features/portfolio/hooks/use-kash";
import {
  addKashToMetaMask,
  MetaMaskDeclinedError,
  MetaMaskUnavailableError,
} from "@/features/portfolio/lib/metamask";

// The MetaMask Symbol, exported from the Kash card in Figma ("Roll Out" ->
// Container-KASH+ -> MetaMask_Symbol_0 1). It is the brand's own seven-path
// fox; the mark this button used to draw was a hand-made approximation with
// the wrong palette and the wrong shapes, which is the defect this fixes.
const MARK = "/market/kash-icon-metamask.svg";

// The export is 28.416 x 27.5372, not square, and Figma ships it with
// preserveAspectRatio="none". Pinning both axes on the <img> would squash it,
// so only the height is ever set and the width follows the intrinsic ratio.
const MARK_HEIGHT = 27.54;

// A shortcut, placed in the Kash card's corner, to get KASH showing up as a
// balance inside MetaMask itself, not just in-app. wallet_watchAsset talks to
// the extension directly and needs no Privy session, so this only depends on
// the token existing on-chain: hidden in mock mode, where there is no real
// contract to add.
//
// The desktop card keeps the design's round chip, 44px across with a fill and
// a border so faint they barely register on the gold card, which is what the
// design draws. The mobile Kash+ card sits the mark bare on the yellow
// gradient (bare), scaled to iconSize.
export function AddToMetaMaskButton({
  bare = false,
  iconSize = 22,
}: {
  bare?: boolean;
  iconSize?: number;
} = {}) {
  const t = useTranslations("kash");
  const { data: status } = useKashStatus();
  const [busy, setBusy] = useState(false);

  const tokenAddress = status?.chainMode === "ethers" ? status.chain?.tokenAddress : undefined;
  if (!tokenAddress) return null;

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await addKashToMetaMask(tokenAddress);
      toast.success(t("addToMetaMaskSuccess"));
    } catch (error) {
      if (error instanceof MetaMaskDeclinedError) {
        // Closed or rejected the prompt, not worth a toast.
      } else if (error instanceof MetaMaskUnavailableError) {
        toast.error(t("addToMetaMaskUnavailable"));
      } else {
        toast.error(t("addToMetaMaskFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      aria-label={t("addToMetaMask")}
      title={t("addToMetaMask")}
      className={
        bare
          ? "ws-pressable grid shrink-0 cursor-pointer place-items-center transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          : "grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/10 bg-black/[0.01] transition-colors hover:border-white/20 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} alt="" className="w-auto" style={{ height: bare ? iconSize : MARK_HEIGHT }} />
    </button>
  );
}
