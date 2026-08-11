"use client";

// Direct-from-device image upload, in three steps: ask the service to sign a
// PUT, send the file to storage, then tell the service it landed and take the
// URL it recommends.
//
// The shapes here were read off the running service, not guessed: it is the one
// part of earn that works today, since it never touches the database. Both
// calls require a `source`, which decides the storage prefix, and `complete`
// identifies the object by the `publicId` that `sign` returned.
//
// The middle step was meant to go straight from the browser. It cannot: the
// bucket answers a CORS preflight with 403 and no headers, so the PUT is
// refused before it starts. It goes through our own /api/earn-upload instead,
// which streams the body to the signed URL. Point it back at the bucket once
// CORS allows PUT from our origin.

import { earnPost } from "@/features/earn/lib/api/client";

// Which bucket prefix the object belongs under. The service rejects anything
// outside this set, and rejects a `complete` whose publicId does not match the
// source it was signed for.
export type ImageSource =
  | "user"
  | "sponsor"
  | "description"
  | "grant-event-pictures"
  | "grant-event-receipts"
  | "grant-agentic-receipts";

// Types the service accepts and the browser can preview.
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface SignedUpload {
  uploadUrl: string;
  // Names the object for the completion call. Not the same as objectKey in
  // principle, even though the service currently returns them equal.
  publicId: string;
  // Exactly the headers the signature covers. Sending others breaks it.
  headers: Record<string, string>;
}

interface SignWire {
  uploadUrl?: string;
  publicId?: string;
  objectKey?: string;
  headers?: Record<string, string>;
  expiresIn?: number;
}

interface CompleteWire {
  recommendedUrl?: string;
  gatewayUrl?: string;
  publicUrl?: string;
}

// Rejects a file before a signed URL is spent on it. Returns the reason so the
// field can say what is wrong rather than just refusing.
export function imageRejectionReason(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Use a PNG, JPEG or WebP image.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `That image is over ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`;
  }
  return null;
}

export async function signImageUpload(file: File, source: ImageSource): Promise<SignedUpload> {
  const data = await earnPost<SignWire>("/image/sign", {
    source,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });

  const uploadUrl = data.uploadUrl;
  const publicId = data.publicId ?? data.objectKey;
  if (!uploadUrl || !publicId) throw new Error("Couldn't start the upload.");
  return { uploadUrl, publicId, headers: data.headers ?? {} };
}

// Sends the bytes. Routed through our own origin because the bucket refuses a
// cross-origin PUT; see the note at the top of this file.
export async function putSignedUpload(
  uploadUrl: string,
  file: File,
  headers: Record<string, string> = {}
): Promise<void> {
  // The service signs for a Content-Type when it knows one, and the request has
  // to carry the same value or the signature will not match.
  const contentType = headers["Content-Type"] ?? headers["content-type"] ?? file.type;

  const res = await fetch(`/api/earn-upload?url=${encodeURIComponent(uploadUrl)}`, {
    method: "POST",
    headers: { "x-upload-content-type": contentType },
    body: file,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "The image couldn't be uploaded.");
  }
}

// Confirms the object landed and returns the URL to persist. `recommendedUrl`
// is the service's own choice, currently an IPFS gateway link; the others are
// fallbacks in case it stops sending it.
export async function completeImageUpload(publicId: string, source: ImageSource): Promise<string> {
  const data = await earnPost<CompleteWire>("/image/complete", { publicId, source });
  const url = data.recommendedUrl ?? data.gatewayUrl ?? data.publicUrl;
  if (!url) throw new Error("The upload finished but no URL came back.");
  return url;
}
