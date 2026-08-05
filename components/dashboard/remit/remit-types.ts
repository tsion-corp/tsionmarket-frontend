import type { PayoutCountry, PayoutMethodId, MobileNetwork } from "@/lib/cross-border";
import type { PayoutBank } from "@/lib/payment/offramp";

// The wizard steps, in order. Review quotes the live rail and sends.
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
  // The payout bank picked from the rail's own list — the id is the bankCode
  // the order is created with. Null for mobile money.
  bank: PayoutBank | null;
  // Recipient's mobile number (local part). The payout partner requires one on
  // every order, bank or wallet; for mobile money it doubles as the wallet.
  recipientPhone: string;
  // Send amount in USD, as the raw input string so conversion stays exact.
  amountUsd: string;
  // Account holder resolved by the rail's name enquiry; null when the check
  // was skipped or failed. Display-only reassurance, never an identity input.
  verifiedAccountName: string | null;
}

export const EMPTY_REMIT_FORM: RemitForm = {
  country: null,
  method: null,
  network: null,
  recipientName: "",
  accountNumber: "",
  bank: null,
  recipientPhone: "",
  amountUsd: "",
  verifiedAccountName: null,
};
