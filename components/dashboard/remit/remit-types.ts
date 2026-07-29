import type { PayoutCountry, PayoutMethodId, MobileNetwork } from "@/lib/cross-border";

// The wizard steps, in order. "review" is the final honest gate while the payout
// provider is not yet wired.
export type RemitStep = "destination" | "recipient" | "amount" | "review";

// Everything the flow collects. Built up across steps and read whole at review.
export interface RemitForm {
  country: PayoutCountry | null;
  method: PayoutMethodId | null;
  // Chosen mobile-money network, only for the mobile_money method.
  network: MobileNetwork | null;
  recipientName: string;
  // Local part of a mobile number (no dial code) or a bank account number.
  accountNumber: string;
  // Free-text bank name for the bank method. Empty for mobile money.
  bankName: string;
  // Send amount in USD, as the raw input string so conversion stays exact.
  amountUsd: string;
}

export const EMPTY_REMIT_FORM: RemitForm = {
  country: null,
  method: null,
  network: null,
  recipientName: "",
  accountNumber: "",
  bankName: "",
  amountUsd: "",
};
