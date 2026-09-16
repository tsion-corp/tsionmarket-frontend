import type { SupportChatApiResponse } from "./types";

export async function sendSupportChatMessage(message: string): Promise<SupportChatApiResponse> {
  const res = await fetch("/api/support-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    let errorMsg = "Support assistant service unavailable";
    try {
      const errData = await res.json();
      if (errData?.error) errorMsg = errData.error;
    } catch {
      // ignore json parse error
    }
    return {
      ok: false,
      error: errorMsg,
    };
  }

  return await res.json();
}
