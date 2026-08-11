"use client";

import { useMutation } from "@tanstack/react-query";
import {
  completeImageUpload,
  imageRejectionReason,
  putSignedUpload,
  signImageUpload,
  type ImageSource,
} from "@/features/earn/lib/api/images";

// Runs the three-step upload and hands back the URL to persist. There is no
// percentage: fetch cannot report upload progress, and the files here are small
// enough that a pending state is honest on its own.
//
// `source` decides which storage prefix the object lands under, and the service
// checks it again on completion, so it is fixed per field rather than chosen at
// upload time.
export function useImageUpload(source: ImageSource) {
  const mutation = useMutation({
    mutationFn: async (file: File): Promise<string> => {
      // Checked before signing so a file the service would refuse does not
      // spend a signed URL.
      const rejection = imageRejectionReason(file);
      if (rejection) throw new Error(rejection);

      const { uploadUrl, publicId, headers } = await signImageUpload(file, source);
      await putSignedUpload(uploadUrl, file, headers);
      return completeImageUpload(publicId, source);
    },
  });

  return {
    upload: mutation.mutateAsync,
    isUploading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
