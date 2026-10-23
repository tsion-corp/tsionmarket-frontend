"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Eyebrow } from "@/components/ui/eyebrow";
import { usePredictionActions } from "@/features/prediction/hooks/use-prediction-actions";
import {
  useCategories,
  refreshMarketsUntilPresent,
} from "@/features/prediction/hooks/use-prediction-markets";
import { attachMetadata, newIdempotencyKey, uploadImage } from "@/features/prediction/lib/api";
import { isImageNotConfigured } from "@/features/prediction/lib/normalize";
import { toBaseUnits } from "@/lib/trade/math";
import { USDC_DECIMALS } from "@/features/prediction/lib/types";
import { randomMarketId } from "@/features/prediction/lib/logic";
import { EventCreatePanel } from "@/features/prediction/components/event-create-panel";
import { toast } from "@/lib/toast";

interface CreateMarketFlowProps {
  onDone: () => void;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Minimum seed liquidity to create a market: $1 (6-dec USDC base units).
const MIN_SEED_USDC = 1_000_000n;

// How long the market stays open, chosen from timer presets. Seconds each.
const DURATIONS: { key: string; label: string; seconds: number }[] = [
  { key: "1d", label: "1d", seconds: 86_400 },
  { key: "3d", label: "3d", seconds: 259_200 },
  { key: "1w", label: "1w", seconds: 604_800 },
  { key: "2w", label: "2w", seconds: 1_209_600 },
  { key: "1M", label: "1M", seconds: 2_592_000 },
];

// Fallback categories (from the platform's category taxonomy) so users can
// always pick one even before the live category list is populated.
const DEFAULT_CATEGORIES = [
  "Crypto",
  "Forex",
  "Commodities",
  "Equities",
  "Sports",
  "Politics",
  "Other",
];

// Target landscape aspect ratio for the market image. Market cards render the
// image in a 16:9 box (see prediction-card.tsx), so we crop to match — any
// source orientation is accepted and center-cropped to fit.
const TARGET_ASPECT = 16 / 9;
// Cap the output width; height follows from TARGET_ASPECT. Keeps the JPEG small.
const MAX_IMAGE_WIDTH = 1280;
// JPEG quality for the compressed upload (0..1). Heavy compression keeps the
// payload small so the upload is fast and well under any body-size limit.
const IMAGE_QUALITY = 0.7;

type ProcessedImage = { ok: true; dataUrl: string } | { ok: false; reason: "read" };

// A decoded source image plus the orientation-corrected dimensions we should
// draw it at. `source` is drawable directly onto a 2D canvas.
type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

// Decodes a file into an orientation-corrected drawable. Camera photos frequently
// store their pixels rotated via an EXIF flag; we prefer
// `createImageBitmap(..., { imageOrientation: "from-image" })`, which bakes the
// EXIF rotation into the bitmap so width/height (and therefore the crop we take)
// reflect what the user actually sees. Browsers without that option fall back to
// <img>, which applies EXIF to naturalWidth/naturalHeight in every
// currently-shipping engine.
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path (e.g. unsupported option or codec).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("read"));
      img.src = url;
    });
    return {
      source: el,
      width: el.naturalWidth,
      height: el.naturalHeight,
      close: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Center-crops the source to the market card's 16:9 aspect ratio and compresses
// it (resize + JPEG) before it ever hits the network. Any orientation is
// accepted: the WHOLE image is fit inside the landscape frame with padding (no
// cropping), so nothing is cut off regardless of the source aspect ratio. A
// multi-MB photo becomes a few hundred KB.
async function processImage(file: File): Promise<ProcessedImage> {
  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch {
    return { ok: false, reason: "read" };
  }
  try {
    // FIT-INSIDE (letterbox), not crop-to-fill: the WHOLE image is scaled to fit
    // within the 16:9 frame and centered, with the surrounding space padded — so
    // no part of the picture is ever cut off. A portrait/square photo keeps all
    // of its content, with padding on the sides; a wide photo pads top/bottom.
    const outWidth = Math.max(
      1,
      Math.min(MAX_IMAGE_WIDTH, decoded.width, Math.round(MAX_IMAGE_WIDTH))
    );
    const frameWidth = outWidth;
    const frameHeight = Math.max(1, Math.round(frameWidth / TARGET_ASPECT));

    // Scale the full source to fit inside the frame (never upscale past source).
    const scale = Math.min(frameWidth / decoded.width, frameHeight / decoded.height, 1);
    const drawW = Math.max(1, Math.round(decoded.width * scale));
    const drawH = Math.max(1, Math.round(decoded.height * scale));
    const dx = Math.round((frameWidth - drawW) / 2);
    const dy = Math.round((frameHeight - drawH) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "read" };
    // Neutral padding behind the image (also flattens transparent PNGs for JPEG).
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(0, 0, frameWidth, frameHeight);
    // Draw the ENTIRE source (0,0,width,height), scaled to fit — nothing clipped.
    ctx.drawImage(decoded.source, 0, 0, decoded.width, decoded.height, dx, dy, drawW, drawH);
    return { ok: true, dataUrl: canvas.toDataURL("image/jpeg", IMAGE_QUALITY) };
  } catch {
    return { ok: false, reason: "read" };
  } finally {
    decoded.close();
  }
}

// Creation flow: pick an image (uploaded to Cloudinary immediately for a secure
// URL), then sign createMarket on-chain (seed + $1 fee, gasless) and attach the
// question/category/image URL. The image must finish uploading before the market
// can be created, so its URL is ready to attach the moment the market exists.
export function CreateMarketFlow({ onDone }: CreateMarketFlowProps) {
  const t = useTranslations("prediction");
  const actions = usePredictionActions();
  const queryClient = useQueryClient();
  const { data: liveCategories } = useCategories();

  // The market id is chosen once and reused for both the image upload and the
  // on-chain createMarket, so the uploaded art belongs to the market we create.
  const marketIdRef = useRef<bigint | null>(null);
  const marketId = () => {
    if (marketIdRef.current == null) marketIdRef.current = randomMarketId();
    return marketIdRef.current;
  };

  // Single vs multi-outcome mode. Single = one YES/NO market (today's flow).
  // Multi = an event grouping several outcome markets (Fed brackets, cap colours…).
  const [mode, setMode] = useState<"single" | "multi">("single");

  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("");
  // Resolution rules text (the "Market Context" / how-it-resolves blurb).
  const [rules, setRules] = useState("");
  const [durationKey, setDurationKey] = useState("1w");
  const [useCustom, setUseCustom] = useState(false);
  const [customClose, setCustomClose] = useState("");
  const [seed, setSeed] = useState("");

  // Image upload state: the secure Cloudinary URL once uploaded.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  // Set when the deployment has no image host configured. An image is REQUIRED
  // to create a market, but we can't require it when hosting is unavailable —
  // in that case we relax the requirement so creation isn't impossible.
  const [hostingUnavailable, setHostingUnavailable] = useState(false);
  // Bumping this remounts the file input to clear its value on removal.
  const [fileInputKey, setFileInputKey] = useState(0);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of [...(liveCategories ?? []), ...DEFAULT_CATEGORIES]) {
      const key = c.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }, [liveCategories]);

  const seedUnits = toBaseUnits(seed, USDC_DECIMALS);
  const seedTooLow = seed !== "" && seedUnits < MIN_SEED_USDC;
  const hasCloseChoice = useCustom ? customClose !== "" : durationKey !== "";
  // A chosen image must finish uploading (or be removed) before creation.
  const imageBlocking = uploading || imageError;
  // An image is REQUIRED so every market card/detail has art — unless the
  // deployment has no image host, in which case we can't require one.
  const imageRequiredMet = imageUrl !== null || hostingUnavailable;
  const valid =
    question.trim().length > 0 &&
    seedUnits >= MIN_SEED_USDC &&
    hasCloseChoice &&
    imageRequiredMet &&
    !imageBlocking &&
    !actions.busy;

  const removeImage = () => {
    setImageUrl(null);
    setImageError(false);
    setUploading(false);
    setFileInputKey((k) => k + 1);
  };

  // Uploads on selection so the secure URL is ready before creation. Checks the
  // size, then crops + compresses to 16:9 client-side before the network call.
  const onPickFile = async (picked: File | null) => {
    if (!picked) return;
    if (picked.size > MAX_IMAGE_BYTES) {
      toast.error(t("imageTooLarge"));
      return;
    }
    // Crop to 16:9 + heavily compress on a canvas before touching the network.
    const processed = await processImage(picked);
    if (!processed.ok) {
      toast.error(t("imageUploadFailed"));
      return;
    }
    setImageUrl(null);
    setImageError(false);
    setUploading(true);
    try {
      const { imageUrl: url } = await uploadImage(
        marketId().toString(),
        processed.dataUrl,
        newIdempotencyKey()
      );
      setImageUrl(url);
    } catch (error) {
      if (isImageNotConfigured(error)) {
        // Image hosting isn't set up on the deployment: don't block creation,
        // just let the user proceed without an image (relax the requirement).
        setImageError(false);
        setHostingUnavailable(true);
        toast.info(t("imageHostingUnavailable"));
      } else {
        setImageError(true);
        toast.error(t("imageUploadFailed"));
      }
    } finally {
      setUploading(false);
    }
  };

  // Resolves the chosen close time to unix seconds, reading the clock here (in
  // the handler, not during render) so presets stay relative to submit time.
  const resolveCloseTime = (): number => {
    if (useCustom) return Math.floor(new Date(customClose).getTime() / 1000);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const duration = DURATIONS.find((d) => d.key === durationKey)?.seconds ?? 0;
    return nowSeconds + duration;
  };

  const submit = async () => {
    if (!valid) return;
    const closeTime = resolveCloseTime();
    if (closeTime <= Math.floor(Date.now() / 1000)) {
      toast.error(t("closeTimeInPast"));
      return;
    }
    const created = await actions.createMarket({
      marketId: marketId(),
      closeTime,
      seedUsdc: seedUnits,
    });
    if (!created) return;

    // The market is on-chain now. Attach the question/category and the secure
    // image URL we already have. A failure here is non-fatal.
    try {
      await attachMetadata(
        marketId().toString(),
        {
          question: question.trim(),
          category: category.trim() || undefined,
          imageUrl: imageUrl ?? undefined,
          rules: rules.trim() || undefined,
        },
        newIdempotencyKey()
      );
    } catch {
      toast.info(t("metadataDeferred"));
    }

    // Close the create panel immediately, then poll the lists until the indexer
    // has mirrored the new market so it appears (with its question, category, and
    // image) without the user reloading the page.
    toast.success(t("marketCreated"));
    onDone();
    void refreshMarketsUntilPresent(queryClient, marketId());
  };

  const inputClass =
    "ws-inset w-full bg-transparent p-3 font-sans text-sm outline-none placeholder:text-white/35";
  const labelClass = "text-[12.5px] font-normal text-white/55";

  return (
    <div className="p-1 sm:p-2">
      <Eyebrow>{t("createMarket")}</Eyebrow>
      <p className="mt-1 text-[12.5px] font-normal text-white/45">{t("createMarketSubtitle")}</p>

      {/* Single market vs multi-outcome event. */}
      <div className="mt-4 inline-flex gap-1 rounded-xl bg-white/5 p-1">
        {(["single", "multi"] as const).map((mo) => (
          <button
            key={mo}
            onClick={() => setMode(mo)}
            className={`cursor-pointer rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              mode === mo ? "bg-white/12 text-white" : "text-white/50 hover:text-white/75"
            }`}
          >
            {t(`createMode_${mo}`)}
          </button>
        ))}
      </div>

      {mode === "multi" ? (
        <div className="mt-4">
          <EventCreatePanel
            onDone={onDone}
            inputClass={inputClass}
            labelClass={labelClass}
            categories={categories}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("questionLabel")}</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("questionPlaceholder")}
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>{t("categoryLabel")}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="" className="bg-sheet">
                  {t("categoryPlaceholder")}
                </option>
                {categories.map((c) => (
                  <option key={c} value={c} className="bg-sheet">
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>{t("seedLabel")}</span>
              <input
                inputMode="decimal"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="1"
                className={inputClass}
              />
              {seedTooLow ? <span className="text-down text-[11.5px]">{t("seedMin")}</span> : null}
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className={labelClass}>{t("closesIn")}</span>
              <button
                type="button"
                onClick={() => setUseCustom((v) => !v)}
                className="text-accent cursor-pointer text-[12px] font-medium"
              >
                {useCustom ? t("usePresets") : t("useCustomDate")}
              </button>
            </div>
            {useCustom ? (
              <input
                type="datetime-local"
                value={customClose}
                onChange={(e) => setCustomClose(e.target.value)}
                className={inputClass}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDurationKey(d.key)}
                    className={`cursor-pointer rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                      durationKey === d.key
                        ? "border-accent/45 bg-accent/12 text-white"
                        : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Image: uploaded to Cloudinary on selection; a preview and status show
            the secure URL is attached before creation is allowed. */}
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>
              {t("imageLabel")}
              {!hostingUnavailable ? <span className="text-down ml-1">*</span> : null}
            </span>
            {imageUrl ? (
              <div className="ws-inset relative overflow-hidden rounded-[14px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="aspect-[16/7] w-full object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 cursor-pointer rounded-lg border border-white/15 bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white/85 backdrop-blur-sm hover:text-white"
                >
                  {t("removeImage")}
                </button>
              </div>
            ) : (
              <>
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  className="font-sans text-[12.5px] text-white/60 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white disabled:opacity-50"
                />
                <span
                  className={
                    uploading ? "text-accent text-[11.5px]" : "text-[11.5px] text-white/40"
                  }
                >
                  {uploading ? t("uploadingImage") : t("imageHint")}
                </span>
                {imageError ? (
                  <span className="text-down text-[11.5px]">{t("imageUploadFailed")}</span>
                ) : null}
              </>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("rulesLabel")}</span>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder={t("rulesPlaceholder")}
              rows={3}
              maxLength={8000}
              className={`${inputClass} resize-none`}
            />
          </label>

          <p className="text-[12px] font-normal text-white/45">{t("createFeeNote")}</p>

          <button
            onClick={submit}
            disabled={!valid}
            className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actions.busy
              ? t("creatingMarket")
              : uploading
                ? t("uploadingImage")
                : t("createMarketCta")}
          </button>
        </div>
      )}
    </div>
  );
}
