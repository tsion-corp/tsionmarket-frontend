import { friendlyError } from "@/lib/errors";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function comboErrorMessage(error: unknown, fallback: string): string {
  if (/builder code not found/iu.test(errorMessage(error))) {
    return "Combo trading is awaiting activation for this app. No order was submitted.";
  }

  return friendlyError(error, fallback);
}
