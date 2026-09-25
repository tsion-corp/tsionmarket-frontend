import { friendlyError } from "@/lib/errors";

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "";
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function gameActionError(error: unknown, productName: string, fallback: string): string {
  const message = errorText(error).toLowerCase();
  if (
    errorCode(error) === "PLAYER_BALANCE_INSUFFICIENT" ||
    /insufficient available balance|player balance insufficient/.test(message)
  ) {
    return `Your ${productName} balance is too low for that ticket. Add funds or choose a smaller amount.`;
  }

  return friendlyError(error, fallback);
}
