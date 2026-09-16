"use client";

import { type FormEvent, useId, useState } from "react";
import { isHexBetCode, normalizeHexBetCodeInput } from "../ticket-code";

interface TicketCodeLookupProps {
  codeLength: number;
  provider: "Azuro" | "Polymarket";
  onLookup: (code: string) => Promise<void>;
}

export function TicketCodeLookup({ codeLength, provider, onLookup }: TicketCodeLookupProps) {
  const inputId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isHexBetCode(code, codeLength);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onLookup(code);
    } catch (lookupError) {
      setError(
        lookupError instanceof Error ? lookupError.message : "Ticket code could not be found."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="border-b border-[#2b2b2b] p-3">
      <label
        htmlFor={inputId}
        className="text-[9px] font-bold tracking-[0.1em] text-[#7e7e7e] uppercase"
      >
        Enter ticket code
      </label>
      <div className="mt-2 flex h-11 overflow-hidden rounded-xl border border-[#353535] bg-[#191919] focus-within:border-[#626262]">
        <input
          id={inputId}
          aria-label={`${provider} ticket code`}
          value={code}
          onChange={(event) => {
            setCode(normalizeHexBetCodeInput(event.target.value, codeLength));
            setError(null);
          }}
          maxLength={codeLength}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={`${codeLength}-character code`}
          className="min-w-0 flex-1 bg-transparent px-3 text-[13px] font-bold tracking-[0.14em] text-white uppercase outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-[#5f5f5f]"
        />
        <button
          type="submit"
          aria-label={`Open ${provider} ticket code`}
          disabled={!valid || busy}
          className="m-1 min-w-[64px] cursor-pointer rounded-lg bg-[#b9fcff] px-3 text-[10px] font-bold text-[#171717] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy ? "Finding..." : "Open"}
        </button>
      </div>
      <p className={`mt-1.5 text-[9px] ${error ? "text-[#ef7e8b]" : "text-[#666]"}`}>
        {error ?? `${provider} uses a ${codeLength}-character hexadecimal ticket code.`}
      </p>
    </form>
  );
}
