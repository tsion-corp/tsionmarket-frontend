"use client";

// Going live is three deliberate steps, never one tap.
//
// Step 1 picks what to send. "This view (Ark only)" is the default because it
// never calls getDisplayMedia at all, so nothing outside Ark can physically
// leak. Step 2 exists only on the Screen path and is the part that makes this
// safe to ship on a trading app: a list of what Ark can see on this screen
// right now, a default-ON blur, and a plain statement of the one thing Ark
// cannot protect against. Step 3 is the browser's own picker, constrained so
// "Entire Screen" is not offered.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { applyForCreator, canBroadcast, fetchMarketSquareProfile } from "@/lib/api/market-square";
import {
  useBroadcastSession,
  type BroadcastTarget,
  type ShareMode,
} from "@/components/broadcast/broadcast-session";
import {
  emptyInventory,
  inventoryLines,
  inventorySensitive,
  type SensitiveInventory,
} from "@/lib/broadcast/sensitive";

const MODES: { id: ShareMode; title: string; body: string; recommended?: boolean }[] = [
  {
    id: "ark",
    title: "This view (Ark only)",
    body: "Only what Ark itself draws. Nothing from any other tab, window or app can appear.",
    recommended: true,
  },
  {
    id: "camera-ark",
    title: "Camera + Ark",
    body: "Your face alongside the Ark view. Still nothing from outside Ark.",
  },
  {
    id: "screen",
    title: "Screen",
    body: "A tab or window you pick. Everything visible on it goes out.",
  },
];

export function ShareFlow({ target, onClose }: { target: BroadcastTarget; onClose: () => void }) {
  const session = useBroadcastSession();
  // Read the creator gate before offering anything. Market Square refuses
  // POST /streams for a citizen, and finding that out AFTER the browser has
  // asked for screen capture is the worst possible ordering: the user grants
  // a permission, works through the picker, chooses a tab, and only then is
  // told their account was never allowed to broadcast.
  const profile = useQuery({
    queryKey: ["market-square", "me"],
    queryFn: fetchMarketSquareProfile,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const isCreator = profile.data ? canBroadcast(profile.data.role) : null;
  const [applying, setApplying] = useState(false);
  const [step, setStep] = useState<"mode" | "sensitive">("mode");
  const [mode, setMode] = useState<ShareMode>("ark");
  const [blur, setBlur] = useState(true);
  const [found, setFound] = useState<SensitiveInventory>(emptyInventory);

  const lines = useMemo(() => inventoryLines(found), [found]);

  // Called straight out of a click so getDisplayMedia still has the transient
  // user activation it requires. Nothing may be awaited before the capture.
  const begin = async (chosen: ShareMode) => {
    session.setBlurSensitive(blur);
    // Every path publishes a video track. The two Ark paths capture this tab
    // with `preferCurrentTab`, so the only surface that can be chosen is Ark
    // itself; the Screen path opens the constrained picker.
    const capture = await session
      .captureScreen(target.content, chosen === "screen" ? "screen" : "ark-view")
      .catch(() => null);
    onClose();
    // A dismissed picker is a cancel, not a failure, and must not create a
    // stream that would go live with nothing in it.
    if (!capture) return;
    await session.goLiveWith({ target, mode: chosen, capture });
  };

  return (
    <div className="fixed inset-0 z-[200] grid place-items-end sm:place-items-center">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <div
        className={
          // A BOTTOM SHEET on a phone, a centred card from `sm` up. The panel
          // had neither a height cap nor a scroller, so a tall step — the
          // sensitive-data list, its checkbox and the warning — simply ran off
          // the bottom of the screen and took the buttons with it. Capping it
          // and letting the body scroll is what keeps the actions reachable,
          // and the safe-area padding keeps the last one clear of the home
          // indicator.
          "bg-sheet relative flex max-h-[85dvh] w-full flex-col overflow-y-auto rounded-t-[22px] border border-white/12 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] " +
          "sm:m-3 sm:max-h-[88dvh] sm:max-w-[420px] sm:rounded-[22px] sm:pb-5"
        }
      >
        {profile.isPending ? (
          <p className="py-2 text-[12.5px] text-white/55">Checking whether you can broadcast…</p>
        ) : profile.isError ? (
          <>
            <h2 className="text-[17px] font-semibold text-white">Market Square did not answer</h2>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/55">
              We cannot tell whether this account can broadcast, so nothing has been started.
            </p>
            <button
              type="button"
              onClick={() => void profile.refetch()}
              className="mt-3.5 w-full cursor-pointer rounded-full border border-white/14 py-2 text-[13px] font-medium text-white/85 hover:bg-white/8"
            >
              Try again
            </button>
          </>
        ) : isCreator === false ? (
          <>
            <h2 className="text-[17px] font-semibold text-white">
              Your account cannot broadcast yet
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/55">
              Only creator accounts can start a Market Square stream. Apply for the creator role and
              you can broadcast once it is approved. You can still join a broadcast someone else
              started.
            </p>
            <button
              type="button"
              disabled={applying}
              onClick={() => {
                setApplying(true);
                applyForCreator(target.creatorApplicationNote)
                  .then(() => toast.success("Creator application sent. Market Square reviews it."))
                  .catch(() => toast.error("Could not send the application."))
                  .finally(() => {
                    setApplying(false);
                    onClose();
                  });
              }}
              className="mt-3.5 w-full cursor-pointer rounded-full bg-white py-2 text-[13px] font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {applying ? "…" : "Apply to be a creator"}
            </button>
          </>
        ) : step === "mode" ? (
          <>
            <h2 className="text-[17px] font-semibold text-white">What do you want to broadcast?</h2>
            <div className="mt-3.5 flex flex-col gap-2">
              {MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMode(option.id);
                    // The screen path is the only one that can leak, so it is
                    // the only one that gets the interstitial.
                    if (option.id === "screen") {
                      // Counted from what is actually rendered right now. A
                      // generic warning gets skimmed; "3 balances, 1 wallet
                      // address" does not.
                      setFound(inventorySensitive(document.body));
                      setStep("sensitive");
                    } else void begin(option.id);
                  }}
                  className={`cursor-pointer rounded-[14px] border p-3 text-left transition-colors ${
                    mode === option.id
                      ? "border-violet-400/50 bg-violet-500/10"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-white">{option.title}</span>
                    {option.recommended ? (
                      <span className="rounded-full bg-violet-500/25 px-2 py-0.5 text-[10px] font-semibold text-violet-100">
                        Recommended
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-white/55">
                    {option.body}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[17px] font-semibold text-white">Before you share your screen</h2>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/55">
              Ark can see this on the screen you are about to share:
            </p>
            <ul className="mt-2.5 rounded-[12px] bg-black/25 p-3 text-[12.5px] text-white/80">
              {lines.length > 0 ? (
                lines.map((line) => (
                  <li key={line} className="flex gap-2 py-0.5">
                    <span aria-hidden className="text-white/35">
                      •
                    </span>
                    {line}
                  </li>
                ))
              ) : (
                <li className="py-0.5 text-white/55">
                  Nothing Ark classes as sensitive is on screen right now.
                </li>
              )}
            </ul>

            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-white/10 p-3">
              <input
                type="checkbox"
                checked={blur}
                onChange={(event) => setBlur(event.target.checked)}
                className="mt-0.5 size-4 accent-violet-400"
              />
              <span>
                <span className="block text-[13px] font-medium text-white">
                  Blur balances &amp; wallet while live
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-white/50">
                  Stays on for the whole broadcast. You can turn it off from the console.
                </span>
              </span>
            </label>

            {/* The one thing none of the above can protect against, said plainly. */}
            <p className="mt-3 rounded-[12px] border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[12px] leading-[1.5] text-amber-100">
              Never share a screen while a seed phrase or private key is visible. Ark cannot detect
              these, and anything on the surface you pick goes out live.
            </p>
            <p className="mt-2 text-[11.5px] leading-[1.5] text-white/45">
              Ark does not offer your entire screen: the picker will only let you choose a tab or a
              window.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("mode")}
                className="flex-1 cursor-pointer rounded-full border border-white/14 py-2 text-[13px] font-medium text-white/85 hover:bg-white/8"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void begin("screen")}
                className="flex-1 cursor-pointer rounded-full bg-white py-2 text-[13px] font-semibold text-black hover:opacity-90"
              >
                I understand — pick a surface
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
