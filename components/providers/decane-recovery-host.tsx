"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  completeRecoveryRequest,
  useRecoveryRequest,
  type RecoveryRequest,
} from "@/lib/decane-recovery";

// Renders the wallet-recovery dialogs Decane's callbacks wait on: the
// new-password prompt after a rotation, the save-your-file step, and the
// restore-from-file prompt for a device with no share. Mounted once inside
// DecaneKit. The rotation dialogs are deliberately not dismissible: each
// resolves a promise the SDK is blocked on, and walking away from a rotation
// would strand the user with a dead recovery file.

const MIN_PASSWORD_LENGTH = 8;

const INPUT =
  "h-12 w-full rounded-[14px] border border-white/14 bg-white/5 px-4 text-[15px] text-white outline-none focus:border-white/30";
const PRIMARY =
  "h-12 w-full cursor-pointer rounded-[14px] bg-white text-[14.5px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50";
const SECONDARY =
  "h-12 w-full cursor-pointer rounded-[14px] border border-white/14 bg-white/8 text-[14.5px] font-medium text-white transition-colors hover:border-white/30";

function PasswordDialog({ request }: { request: Extract<RecoveryRequest, { kind: "rotated" }> }) {
  const t = useTranslations("recovery");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState("");
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const submit = () => {
    if (password.length < MIN_PASSWORD_LENGTH) return;
    request.resolve({ password, passwordHint: hint.trim() || undefined });
    completeRecoveryRequest(request);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="ws-display text-[20px]">{t("rotatedTitle")}</div>
        <p className="mt-1.5 text-[13.5px] leading-[1.55] text-white/55">{t("rotatedBody")}</p>
      </div>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("passwordPlaceholder")}
        autoComplete="new-password"
        className={INPUT}
      />
      <input
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder={t("hintPlaceholder")}
        className={INPUT}
      />
      {tooShort ? <p className="text-[13px] text-red-400">{t("passwordTooShort")}</p> : null}
      <button onClick={submit} disabled={password.length < MIN_PASSWORD_LENGTH} className={PRIMARY}>
        {t("createFile")}
      </button>
    </div>
  );
}

function FileDialog({ request }: { request: Extract<RecoveryRequest, { kind: "file" }> }) {
  const t = useTranslations("recovery");
  const [downloaded, setDownloaded] = useState(false);

  const download = () => {
    const blob = new Blob([JSON.stringify(request.file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = request.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const done = () => {
    request.resolve();
    completeRecoveryRequest(request);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="ws-display text-[20px]">{t("fileTitle")}</div>
        <p className="mt-1.5 text-[13.5px] leading-[1.55] text-white/55">{t("fileBody")}</p>
      </div>
      <button onClick={download} className={PRIMARY}>
        {t("downloadFile")}
      </button>
      <button onClick={done} disabled={!downloaded} className={SECONDARY}>
        {t("savedIt")}
      </button>
    </div>
  );
}

// A new device with no passkey: the only way in is the recovery file the user
// saved. Cancelling is allowed here (unlike the rotation dialogs) and resolves
// null, which the kit surfaces as NewDeviceError on the sign-in screen.
function RestoreDialog({ request }: { request: Extract<RecoveryRequest, { kind: "restore" }> }) {
  const t = useTranslations("recovery");
  const [file, setFile] = useState<{ name: string; value: unknown } | null>(null);
  const [password, setPassword] = useState("");
  const [unreadable, setUnreadable] = useState(false);

  const pick = async (picked: File | undefined) => {
    setUnreadable(false);
    if (!picked) return;
    try {
      setFile({ name: picked.name, value: JSON.parse(await picked.text()) });
    } catch {
      setFile(null);
      setUnreadable(true);
    }
  };

  const restore = () => {
    if (!file || !password) return;
    request.resolve({ value: file.value, getPassword: async () => password });
    completeRecoveryRequest(request);
  };

  const cancel = () => {
    request.resolve(null);
    completeRecoveryRequest(request);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="ws-display text-[20px]">{t("restoreTitle")}</div>
        <p className="mt-1.5 text-[13.5px] leading-[1.55] text-white/55">{t("restoreBody")}</p>
      </div>
      <label className={`${SECONDARY} grid cursor-pointer place-items-center truncate px-4`}>
        {file ? file.name : t("chooseFile")}
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </label>
      {unreadable ? <p className="text-[13px] text-red-400">{t("fileUnreadable")}</p> : null}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("restorePasswordPlaceholder")}
        autoComplete="current-password"
        className={INPUT}
      />
      <button onClick={restore} disabled={!file || !password} className={PRIMARY}>
        {t("restore")}
      </button>
      <button onClick={cancel} className={SECONDARY}>
        {t("cancelRestore")}
      </button>
    </div>
  );
}

const PIN_PATTERN = /^\d{4,8}$/;

// Mirrors the kit's MIN_PASSWORD_LENGTH; the kit re-checks and is the authority.
const MIN_UNLOCK_PASSWORD_LENGTH = 8;

/**
 * The PIN that wraps the device share when this device has no usable passkey.
 *
 * On setup it is asked for twice. The PIN is never sent anywhere and cannot be
 * reset: a typo here would wrap the share with a value the user does not know,
 * which is a locked wallet rather than an inconvenience. On unlock, once is
 * enough — a wrong entry simply fails and can be retried.
 */
function PinDialog({ request }: { request: Extract<RecoveryRequest, { kind: "pin" }> }) {
  const t = useTranslations("recovery");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  const malformed = pin.length > 0 && !PIN_PATTERN.test(pin);
  const mismatched = request.setup && confirm.length > 0 && confirm !== pin;
  const ready = PIN_PATTERN.test(pin) && (!request.setup || confirm === pin);

  const submit = () => {
    if (!ready) return;
    request.resolve(pin);
    completeRecoveryRequest(request);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="ws-display text-[19px]">
          {request.setup ? t("pinSetupTitle") : t("pinUnlockTitle")}
        </div>
        <p className="mt-1.5 text-[13.5px] font-normal text-white/55">
          {request.setup ? t("pinSetupBody") : t("pinUnlockBody")}
        </p>
      </div>

      <input
        className={INPUT}
        type="password"
        inputMode="numeric"
        autoComplete={request.setup ? "new-password" : "current-password"}
        maxLength={8}
        placeholder={t("pinPlaceholder")}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
      />

      {request.setup ? (
        <input
          className={INPUT}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={8}
          placeholder={t("pinConfirmPlaceholder")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      ) : null}

      {malformed ? (
        <p className="text-[12.5px] font-normal text-amber-300/90">{t("pinMalformed")}</p>
      ) : mismatched ? (
        <p className="text-[12.5px] font-normal text-amber-300/90">{t("pinMismatch")}</p>
      ) : null}

      <button onClick={submit} disabled={!ready} className={PRIMARY}>
        {request.setup ? t("pinSetupAction") : t("pinUnlockAction")}
      </button>
    </div>
  );
}

/**
 * The device unlock password.
 *
 * Deliberately not the PIN dialog with a different regex. A PIN wraps only the
 * device share, which is one of three and opens nothing by itself; this
 * password also decrypts the token that buys a session, so it is the whole
 * strength of the "unlock without signing in" path. Hence the real minimum, the
 * refusal of digits-only input, and the double entry at setup — a typo here
 * wraps the share with a value nobody knows, which is a locked wallet.
 *
 * The kit validates the same rules and is the authority; these are here so the
 * user finds out while typing rather than on submit.
 */
function UnlockPasswordDialog({
  request,
}: {
  request: Extract<RecoveryRequest, { kind: "password" }>;
}) {
  const t = useTranslations("recovery");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const tooShort = password.length > 0 && password.length < MIN_UNLOCK_PASSWORD_LENGTH;
  const digitsOnly = password.length > 0 && /^\d+$/.test(password);
  const mismatched = request.setup && confirm.length > 0 && confirm !== password;
  const wellFormed = password.length >= MIN_UNLOCK_PASSWORD_LENGTH && !/^\d+$/.test(password);
  // Only the setup path can be checked for strength; on unlock the password is
  // whatever it already is, and blocking submission would lock the user out.
  const ready = request.setup ? wellFormed && confirm === password : password.length > 0;

  const submit = () => {
    if (!ready) return;
    request.resolve(password);
    completeRecoveryRequest(request);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="ws-display text-[19px]">
          {request.setup ? t("unlockPwSetupTitle") : t("unlockPwEnterTitle")}
        </div>
        <p className="mt-1.5 text-[13.5px] font-normal text-white/55">
          {request.setup ? t("unlockPwSetupBody") : t("unlockPwEnterBody")}
        </p>
      </div>

      <input
        className={INPUT}
        type="password"
        autoComplete={request.setup ? "new-password" : "current-password"}
        placeholder={t("unlockPwPlaceholder")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
      />

      {request.setup ? (
        <input
          className={INPUT}
          type="password"
          autoComplete="new-password"
          placeholder={t("unlockPwConfirmPlaceholder")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      ) : null}

      {request.setup && tooShort ? (
        <p className="text-[12.5px] font-normal text-amber-300/90">
          {t("unlockPwTooShort", { min: MIN_UNLOCK_PASSWORD_LENGTH })}
        </p>
      ) : request.setup && digitsOnly ? (
        <p className="text-[12.5px] font-normal text-amber-300/90">{t("unlockPwDigitsOnly")}</p>
      ) : mismatched ? (
        <p className="text-[12.5px] font-normal text-amber-300/90">{t("unlockPwMismatch")}</p>
      ) : null}

      <button onClick={submit} disabled={!ready} className={PRIMARY}>
        {request.setup ? t("unlockPwSetupAction") : t("unlockPwEnterAction")}
      </button>
      {/* Always offered, including at setup. Withholding it meant a dialog with
          no way out: a user who opened this and changed their mind had to
          reload the page. Cancelling setup costs the device its stored share —
          the kit says so and carries on — which is a smaller harm than a modal
          that cannot be dismissed. */}
      <button
        onClick={() => {
          request.resolve(null);
          completeRecoveryRequest(request);
        }}
        className={SECONDARY}
      >
        {t("unlockPwCancel")}
      </button>
    </div>
  );
}

export function DecaneRecoveryHost() {
  const request = useRecoveryRequest();

  // Escape dismisses the password dialogs, which is what people press before
  // they look for a button. The recovery dialogs are deliberately not
  // dismissible this way: rotation has already spent the user's old file by
  // the time they are shown, so leaving without the replacement strands them.
  useEffect(() => {
    if (request?.kind !== "password") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      request.resolve(null);
      completeRecoveryRequest(request);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  if (!request) return null;
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="ws-card w-full max-w-[420px] px-6 py-6">
        {request.kind === "file" ? (
          <FileDialog request={request} />
        ) : request.kind === "restore" ? (
          <RestoreDialog request={request} />
        ) : request.kind === "pin" ? (
          <PinDialog request={request} />
        ) : request.kind === "password" ? (
          <UnlockPasswordDialog request={request} />
        ) : (
          <PasswordDialog request={request} />
        )}
      </div>
    </div>
  );
}
