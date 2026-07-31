import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeImageUpload,
  imageRejectionReason,
  putSignedUpload,
  signImageUpload,
} from "@/lib/earn/api/images";

// The shapes here were read off the running earn service, which is the one part
// of earn that works today. They are pinned because the contract doc describes
// this flow only loosely, and getting either body wrong fails with a 400 that
// says nothing useful to a user mid-upload.

const earnPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/earn/api/client", () => ({ earnPost, earnGet: vi.fn() }));

function pngFile(name = "logo.png", size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type: "image/png" });
  // jsdom builds the blob honestly, but a size override keeps the cap testable
  // without allocating megabytes.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signing", () => {
  it("sends the source the service requires, not just the file", () => {
    // Omitting `source` is a 400: it is what decides the storage prefix.
    earnPost.mockResolvedValue({ uploadUrl: "https://x.s3.filebase.com/o", publicId: "p" });

    void signImageUpload(pngFile(), "sponsor");

    expect(earnPost).toHaveBeenCalledWith(
      "/image/sign",
      expect.objectContaining({ source: "sponsor", contentType: "image/png" })
    );
  });

  it("keeps the publicId and the signed headers, which completion and the PUT need", async () => {
    earnPost.mockResolvedValue({
      uploadUrl: "https://x.s3.filebase.com/o",
      publicId: "earn-sponsor-dev/u/123.png",
      objectKey: "earn-sponsor-dev/u/123.png",
      headers: { "Content-Type": "image/png" },
    });

    const signed = await signImageUpload(pngFile(), "sponsor");

    expect(signed.publicId).toBe("earn-sponsor-dev/u/123.png");
    expect(signed.headers).toEqual({ "Content-Type": "image/png" });
  });

  it("falls back to objectKey when no publicId comes back", async () => {
    earnPost.mockResolvedValue({ uploadUrl: "https://x.s3.filebase.com/o", objectKey: "k" });
    expect((await signImageUpload(pngFile(), "user")).publicId).toBe("k");
  });

  it("refuses to proceed without a URL to upload to", async () => {
    earnPost.mockResolvedValue({ publicId: "p" });
    await expect(signImageUpload(pngFile(), "user")).rejects.toThrow(/couldn't start/i);
  });
});

describe("completing", () => {
  it("identifies the object by publicId and source", async () => {
    // Sending `key` instead of `publicId` is a 400, and a publicId that does
    // not match its source is refused too.
    earnPost.mockResolvedValue({ recommendedUrl: "https://ipfs.filebase.io/ipfs/Qm123" });

    const url = await completeImageUpload("earn-sponsor-dev/u/123.png", "sponsor");

    expect(earnPost).toHaveBeenCalledWith("/image/complete", {
      publicId: "earn-sponsor-dev/u/123.png",
      source: "sponsor",
    });
    expect(url).toBe("https://ipfs.filebase.io/ipfs/Qm123");
  });

  it("prefers the service's recommendation over the raw bucket URL", async () => {
    earnPost.mockResolvedValue({
      recommendedUrl: "https://ipfs.filebase.io/ipfs/Qm123",
      gatewayUrl: "https://ipfs.filebase.io/ipfs/Qm123",
      publicUrl: "https://bucket.s3.filebase.io/o.png",
    });
    expect(await completeImageUpload("p", "sponsor")).toBe("https://ipfs.filebase.io/ipfs/Qm123");
  });

  it("falls back rather than failing when the recommendation is missing", async () => {
    earnPost.mockResolvedValue({ publicUrl: "https://bucket.s3.filebase.io/o.png" });
    expect(await completeImageUpload("p", "sponsor")).toBe("https://bucket.s3.filebase.io/o.png");
  });

  it("refuses to persist nothing", async () => {
    earnPost.mockResolvedValue({});
    await expect(completeImageUpload("p", "sponsor")).rejects.toThrow(/no URL/i);
  });
});

describe("uploading the bytes", () => {
  it("goes through our own origin, because the bucket refuses a cross-origin PUT", async () => {
    // A direct browser PUT is rejected at the CORS preflight with 403 and no
    // headers, so the bytes are streamed server-side instead.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://bucket.s3.filebase.com/object?X-Amz-Signature=abc";
    await putSignedUpload(url, pngFile(), { "Content-Type": "image/png" });

    const [called, init] = fetchMock.mock.calls[0];
    expect(called).toBe(`/api/earn-upload?url=${encodeURIComponent(url)}`);
    expect(init.method).toBe("POST");
    // The signature covers this header, so it has to survive the detour.
    expect(init.headers["x-upload-content-type"]).toBe("image/png");

    vi.unstubAllGlobals();
  });

  it("surfaces the reason storage gave rather than a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Storage refused that upload." } }),
      })
    );

    await expect(putSignedUpload("https://x.s3.filebase.com/o", pngFile())).rejects.toThrow(
      "Storage refused that upload."
    );

    vi.unstubAllGlobals();
  });
});

describe("rejecting a file before a URL is spent on it", () => {
  it("accepts the types the service takes", () => {
    expect(imageRejectionReason(pngFile())).toBeNull();
  });

  it("refuses a type that is not an accepted image", () => {
    const pdf = new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" });
    expect(imageRejectionReason(pdf)).toMatch(/PNG, JPEG or WebP/i);
  });

  it("refuses a file over the cap", () => {
    expect(imageRejectionReason(pngFile("big.png", 6 * 1024 * 1024))).toMatch(/over 5MB/i);
  });
});
