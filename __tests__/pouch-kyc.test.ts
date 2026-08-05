import { describe, expect, it } from "vitest";
import {
  buildKycDocuments,
  fallbackKycFields,
  fieldsFromRequiredDocs,
  humanizeKey,
  inferFieldKind,
  isFormSubmittable,
  isNameMismatchMessage,
  kycMaxLength,
  normalizeInitiation,
  normalizeKycState,
  validateKycValue,
  type KycField,
} from "@/lib/pouch/kyc";
import { isReusableSession, isSessionActive, type KycSession } from "@/lib/pouch/session";

const field = (over: Partial<KycField> = {}): KycField => ({
  key: "FULL_NAME",
  label: "Full name",
  required: true,
  kind: "text",
  ...over,
});

describe("field kind inference", () => {
  it("infers controls from Nigeria's document types", () => {
    expect(inferFieldKind("DOB")).toBe("date");
    expect(inferFieldKind("EMAIL")).toBe("email");
    expect(inferFieldKind("PHONE")).toBe("tel");
    expect(inferFieldKind("NIN")).toBe("number");
    expect(inferFieldKind("BVN")).toBe("number");
    expect(inferFieldKind("FULL_NAME")).toBe("text");
    expect(inferFieldKind("ADDRESS")).toBe("text");
    expect(inferFieldKind("SOMETHING_NEW")).toBe("text");
  });
});

describe("kyc state normalization", () => {
  it("maps provider statuses and defaults sensibly", () => {
    expect(normalizeKycState("VERIFIED")).toBe("approved");
    expect(normalizeKycState("NOT_FOUND")).toBe("not_started");
    expect(normalizeKycState("PENDING")).toBe("pending");
    expect(normalizeKycState("FAILED")).toBe("failed");
    expect(normalizeKycState("EXPIRED")).toBe("expired");
    expect(normalizeKycState("REJECTED")).toBe("rejected");
    expect(normalizeKycState("")).toBe("not_started");
    expect(normalizeKycState("weird")).toBe("pending");
  });
});

describe("fields from required docs", () => {
  it("builds required fields in order, dropping blanks and duplicates", () => {
    const fields = fieldsFromRequiredDocs(["FULL_NAME", "DOB", "NIN", "", "NIN"]);
    expect(fields.map((f) => f.key)).toEqual(["FULL_NAME", "DOB", "NIN"]);
    expect(fields.every((f) => f.required)).toBe(true);
    expect(fields[1]).toMatchObject({ kind: "date", label: "Dob" });
  });

  it("returns nothing for a non-array", () => {
    expect(fieldsFromRequiredDocs(undefined)).toEqual([]);
    expect(fieldsFromRequiredDocs("nope")).toEqual([]);
  });
});

describe("initiate normalization", () => {
  it("reads status, hasSharedKyc, and the required docs into fields", () => {
    const result = normalizeInitiation({
      success: true,
      hasSharedKyc: false,
      kycStatus: "NOT_FOUND",
      expiresAt: "2026-01-01T00:00:00Z",
      kycRequirements: {
        mode: "PASS_THROUGH",
        requiredDocs: ["FULL_NAME", "PHONE", "ADDRESS", "DOB", "EMAIL", "NIN", "BVN"],
      },
    });
    expect(result.hasSharedKyc).toBe(false);
    expect(result.state).toBe("not_started");
    expect(result.fields.map((f) => f.key)).toEqual([
      "FULL_NAME",
      "PHONE",
      "ADDRESS",
      "DOB",
      "EMAIL",
      "NIN",
      "BVN",
    ]);
    expect(result.expiresAt).toBe("2026-01-01T00:00:00Z");
  });

  it("survives a malformed payload", () => {
    const result = normalizeInitiation(null);
    expect(result).toMatchObject({ hasSharedKyc: false, state: "not_started", fields: [] });
  });
});

describe("humanizeKey", () => {
  it("turns an upper-snake key into a sentence label", () => {
    expect(humanizeKey("FULL_NAME")).toBe("Full name");
    expect(humanizeKey("BVN")).toBe("Bvn");
  });
});

describe("field validation and assembly", () => {
  it("requires a value only when required and checks shapes", () => {
    expect(validateKycValue(field({ required: true }), "")).toBe("required");
    expect(validateKycValue(field({ required: false }), "")).toBeNull();
    expect(validateKycValue(field({ kind: "email" }), "bad")).toBe("invalidEmail");
    expect(validateKycValue(field({ kind: "email" }), "a@b.co")).toBeNull();
    expect(validateKycValue(field({ kind: "tel" }), "080")).toBe("invalidPhone");
    expect(validateKycValue(field({ kind: "tel" }), "08031234567")).toBeNull();
    expect(validateKycValue(field({ kind: "date" }), "1990-13-40")).toBe("invalidDate");
    expect(validateKycValue(field({ kind: "date" }), "1990-01-15")).toBeNull();
    expect(validateKycValue(field({ kind: "number" }), "12a")).toBe("invalidNumber");
    expect(validateKycValue(field({ kind: "number" }), "12345678901")).toBeNull();
  });

  it("enforces 11 digits for NIN, BVN, and phone", () => {
    expect(validateKycValue(field({ key: "NIN", kind: "number" }), "1234567890")).toBe(
      "invalid11Digits"
    );
    expect(validateKycValue(field({ key: "NIN", kind: "number" }), "12345678901")).toBeNull();
    expect(validateKycValue(field({ key: "BVN", kind: "number" }), "123")).toBe("invalid11Digits");
    expect(validateKycValue(field({ key: "BVN", kind: "number" }), "12345678901")).toBeNull();
    // Separators are ignored; only the digit count matters.
    expect(validateKycValue(field({ key: "PHONE", kind: "tel" }), "0803 123 4567")).toBeNull();
    expect(validateKycValue(field({ key: "PHONE", kind: "tel" }), "0803123456")).toBe(
      "invalidPhone"
    );
    expect(kycMaxLength(field({ key: "NIN" }))).toBe(11);
    expect(kycMaxLength(field({ key: "BVN" }))).toBe(11);
    expect(kycMaxLength(field({ key: "PHONE" }))).toBeUndefined();
    expect(kycMaxLength(field({ key: "FULL_NAME" }))).toBeUndefined();
  });

  it("gates submission and builds the documents map with verbatim keys", () => {
    const fields = [
      field({ key: "FULL_NAME", required: true, kind: "text" }),
      field({ key: "NIN", required: true, kind: "number" }),
    ];
    expect(isFormSubmittable(fields, { FULL_NAME: "Ada" })).toBe(false);
    expect(isFormSubmittable(fields, { FULL_NAME: "Ada", NIN: "12345678901" })).toBe(true);
    expect(buildKycDocuments(fields, { FULL_NAME: "  Ada  ", NIN: "12345678901" })).toEqual({
      FULL_NAME: "Ada",
      NIN: "12345678901",
    });
  });
});

describe("session reuse", () => {
  const base: KycSession = {
    email: "a@b.co",
    countryCode: "NG",
    token: "jwt",
    expiresAt: "",
    state: "approved",
  };
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 1000).toISOString();

  it("is active only while unexpired", () => {
    expect(isSessionActive({ ...base, expiresAt: future })).toBe(true);
    expect(isSessionActive({ ...base, expiresAt: past })).toBe(false);
    expect(isSessionActive(null)).toBe(false);
  });

  it("is reusable only when active and approved", () => {
    expect(isReusableSession({ ...base, expiresAt: future, state: "approved" })).toBe(true);
    expect(isReusableSession({ ...base, expiresAt: future, state: "pending" })).toBe(false);
    expect(isReusableSession({ ...base, expiresAt: past, state: "approved" })).toBe(false);
  });
});

describe("isNameMismatchMessage", () => {
  it("flags provider name-match failures", () => {
    expect(isNameMismatchMessage("Name mismatch with BVN record")).toBe(true);
    expect(isNameMismatchMessage("The provided name does not match your NIN")).toBe(true);
    expect(isNameMismatchMessage("Error: name match failed")).toBe(true);
    expect(isNameMismatchMessage("Invalid name for this BVN")).toBe(true);
    expect(isNameMismatchMessage("Full name differs from ID records")).toBe(true);
  });

  it("ignores unrelated failures", () => {
    expect(isNameMismatchMessage("Invalid BVN number")).toBe(false);
    expect(isNameMismatchMessage("Verification timed out")).toBe(false);
    expect(isNameMismatchMessage("")).toBe(false);
    expect(isNameMismatchMessage(null)).toBe(false);
    expect(isNameMismatchMessage(undefined)).toBe(false);
  });
});

describe("fallbackKycFields", () => {
  it("covers Nigeria's full document set for a forced resubmission", () => {
    expect(fallbackKycFields().map((f) => f.key)).toEqual([
      "FULL_NAME",
      "EMAIL",
      "PHONE",
      "ADDRESS",
      "DOB",
      "NIN",
      "BVN",
    ]);
    expect(fallbackKycFields().every((f) => f.required)).toBe(true);
  });
});
