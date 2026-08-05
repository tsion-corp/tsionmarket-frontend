// Pouch Finance Shared KYC: verify a user's identity once, then reuse it for
// every onramp. The user proves an email with an OTP, submits the fields Pouch
// asks for, and receives a JWT that authorizes later ramp calls for about a
// month. This module holds the domain types, the field model, and the pure
// helpers that turn Pouch's requirements into a form. Provider raw shapes never
// leave here; components and hooks see only the normalized types below.

// The onramp corridor is Nigeria, so KYC is collected for NG.
export const KYC_COUNTRY_CODE = "NG";

// The control we render for a requirement. Pouch names the document type, and we
// infer the input kind from it. Unknown types fall back to plain text, so a new
// requirement Pouch introduces still renders and submits.
export type KycFieldKind = "text" | "email" | "tel" | "date" | "number" | "file";

export interface KycField {
  // The document type verbatim (for example "FULL_NAME", "NIN", "DOB"). This is
  // the exact key Pouch expects back in the submit `documents` map, so it is
  // never lowercased or renamed.
  key: string;
  label: string;
  required: boolean;
  kind: KycFieldKind;
}

// A single UI-facing state, unifying the different status enums Pouch returns
// from initiate, submit, and status. Every screen reads this, never raw strings.
export type KycState = "not_started" | "pending" | "approved" | "rejected" | "failed" | "expired";

export interface KycInitiation {
  hasSharedKyc: boolean;
  state: KycState;
  // The fields to collect, derived from the requirements in the initiate reply.
  fields: KycField[];
  expiresAt: string | null;
}

// Map any raw Pouch status to our unified state. NOT_FOUND (initiate) and
// NOT_STARTED (status) both mean no KYC yet. VERIFIED is success, REJECTED a
// final decline. FAILED and EXPIRED are recoverable: correct and resubmit.
export function normalizeKycState(raw: string | null | undefined): KycState {
  switch ((raw ?? "").toUpperCase()) {
    case "VERIFIED":
      return "approved";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "rejected";
    case "FAILED":
      return "failed";
    case "EXPIRED":
      return "expired";
    case "NOT_STARTED":
    case "NOT_FOUND":
    case "":
      return "not_started";
    default:
      // An unknown status is treated as pending: neither claim success nor block.
      return "pending";
  }
}

export function isApprovedState(state: KycState): boolean {
  return state === "approved";
}

export function isRetryableState(state: KycState): boolean {
  return state === "failed" || state === "expired";
}

export function isTerminalRejectState(state: KycState): boolean {
  return state === "rejected";
}

// Whether a provider failure message points at the submitted name not matching
// the identity records (BVN/NIN). A blind resubmit of the same details fails
// again; the fix is a fresh pass: correct the name, prove the email again, and
// submit again. Only ever run on failure messages, so "name" plus any match or
// validity complaint is a safe signal.
export function isNameMismatchMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  if (!m.includes("name")) return false;
  return ["mismatch", "match", "incorrect", "invalid", "differ"].some((word) => m.includes(word));
}

// Infer the input control from a Pouch document type. Matched against the
// uppercased type so provider casing never matters. Presentation only: it never
// decides whether a field is required.
export function inferFieldKind(documentType: string): KycFieldKind {
  const t = documentType.toUpperCase();
  if (/DOB|DATE[_-]?OF[_-]?BIRTH|BIRTH_?DATE|(^|_)DATE(_|$)/.test(t)) return "date";
  if (t.includes("EMAIL")) return "email";
  if (t.includes("PHONE") || t.includes("MOBILE") || t.includes("MSISDN")) return "tel";
  if (/SELFIE|PASSPORT|PHOTO|IMAGE|SCAN|UPLOAD|FRONT|BACK|PROOF|DOCUMENT|_DOC(_|$)/.test(t))
    return "file";
  if (/NIN|BVN|ID[_-]?NUMBER|_NUMBER(_|$)|_NO(_|$)/.test(t)) return "number";
  return "text";
}

// "FULL_NAME" -> "Full name". Used to label a field when Pouch sends only a type.
export function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim().toLowerCase().split(/\s+/);
  if (words.length === 0 || words[0] === "") return key;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Build the field model from Pouch's `requiredDocs` (a list of document types,
// all required). Blanks and duplicates are dropped so the form is always clean.
export function fieldsFromRequiredDocs(requiredDocs: unknown): KycField[] {
  if (!Array.isArray(requiredDocs)) return [];
  const seen = new Set<string>();
  const fields: KycField[] = [];
  for (const entry of requiredDocs) {
    const key = asString(entry).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label: humanizeKey(key), required: true, kind: inferFieldKind(key) });
  }
  return fields;
}

// Nigeria's Shared KYC document set, per Pouch's country requirements. Used
// when a resubmission is forced but the initiate reply carries no requiredDocs
// (Pouch omits them once a user is marked verified), so the form is never empty.
const NG_KYC_DOCS = ["FULL_NAME", "EMAIL", "PHONE", "ADDRESS", "DOB", "NIN", "BVN"];

export function fallbackKycFields(): KycField[] {
  return fieldsFromRequiredDocs(NG_KYC_DOCS);
}

// Normalize the initiate response: whether the user already has KYC, their
// current state, and the fields to collect if they do not.
export function normalizeInitiation(raw: unknown): KycInitiation {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const requirements = (record.kycRequirements ?? {}) as Record<string, unknown>;
  return {
    hasSharedKyc: record.hasSharedKyc === true,
    state: normalizeKycState(asString(record.kycStatus)),
    fields: fieldsFromRequiredDocs(requirements.requiredDocs),
    expiresAt: asString(record.expiresAt) || null,
  };
}

// A validation outcome as a stable code the UI maps to a localized message.
export type KycFieldError =
  | "required"
  | "invalidEmail"
  | "invalidPhone"
  | "invalidDate"
  | "invalidNumber"
  | "invalid11Digits"
  | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Nigeria: NIN and BVN are exactly 11 digits, and phone numbers are 11 digits.
const ELEVEN_DIGIT_IDS = /(^|_)(NIN|BVN)(_|$)/;
const PHONE_DIGITS = 11;

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

// Validate one field's value against its type and required flag. The required
// flag is authoritative from Pouch; the format checks catch obvious mistakes
// before submission. Some Nigerian document types have an exact digit length.
export function validateKycValue(field: KycField, value: string): KycFieldError {
  const trimmed = value.trim();
  if (!trimmed) return field.required ? "required" : null;

  // NIN and BVN are exactly 11 digits, whichever kind they were inferred as.
  if (ELEVEN_DIGIT_IDS.test(field.key.toUpperCase())) {
    return digitsOf(trimmed).length === 11 ? null : "invalid11Digits";
  }

  switch (field.kind) {
    case "email":
      return EMAIL_RE.test(trimmed) ? null : "invalidEmail";
    case "tel":
      return digitsOf(trimmed).length === PHONE_DIGITS ? null : "invalidPhone";
    case "date":
      return ISO_DATE_RE.test(trimmed) && !Number.isNaN(Date.parse(trimmed)) ? null : "invalidDate";
    case "number":
      return /^\d+$/.test(trimmed.replace(/\s/g, "")) ? null : "invalidNumber";
    default:
      return null;
  }
}

// The maximum characters an input should accept, for fixed-length fields. NIN
// and BVN are exactly 11 digits; phone numbers are left uncapped so a leading
// zero or a +234 prefix is not cut off.
export function kycMaxLength(field: KycField): number | undefined {
  return ELEVEN_DIGIT_IDS.test(field.key.toUpperCase()) ? 11 : undefined;
}

// Whether every required field is valid. Optional blanks do not block.
export function isFormSubmittable(fields: KycField[], values: Record<string, string>): boolean {
  return fields.every((field) => validateKycValue(field, values[field.key] ?? "") == null);
}

// Build the `documents` map Pouch's submit endpoint expects: exact document-type
// keys to trimmed values. Optional fields left blank are omitted.
export function buildKycDocuments(
  fields: KycField[],
  values: Record<string, string>
): Record<string, string> {
  const documents: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.key] ?? "").trim();
    if (value) documents[field.key] = value;
  }
  return documents;
}
