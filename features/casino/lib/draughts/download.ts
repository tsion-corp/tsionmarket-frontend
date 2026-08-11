"use client";

// Save a text file from the browser. Used for the PDN export, which the service
// returns as a string rather than a file, so the download is assembled here.
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers, so the URL
  // is released on the next tick instead.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
