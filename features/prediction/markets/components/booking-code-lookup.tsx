"use client";

import { useId, useState, type FormEvent } from "react";
import { friendlyError } from "@/lib/errors";
import { fetchSinglesTicket, singlesTicketToReceipt } from "../api";
import { BOOKING_CODE_LENGTH, isBookingCode, normalizeBookingCodeInput } from "../booking-code";
import type { SinglesBetReceipt } from "../singles-receipt";

interface BookingCodeLookupProps {
  onLoaded: (receipt: SinglesBetReceipt) => void;
}

export function BookingCodeLookup({ onLoaded }: BookingCodeLookupProps) {
  const inputId = useId();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBookingCode(code) || loading) return;

    setLoading(true);
    setError(null);
    try {
      const ticket = await fetchSinglesTicket(code);
      onLoaded(singlesTicketToReceipt(ticket));
    } catch (cause) {
      setError(friendlyError(cause, "That booking code could not be found."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void loadTicket(event)}
      className="border-t border-white/8 bg-[#111114] px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <label
        htmlFor={inputId}
        className="flex items-center gap-2 text-[15px] leading-5 font-bold text-white/90"
      >
        Please insert booking code
        <span
          aria-hidden="true"
          className="grid size-[14px] place-items-center rounded-full border border-current text-[9px] font-black text-white/70"
        >
          i
        </span>
      </label>
      <div className="mt-4 flex h-11 overflow-hidden rounded-[6px] border border-white/12 bg-black/30 focus-within:border-white/30">
        <input
          id={inputId}
          value={code}
          onChange={(event) => {
            setCode(normalizeBookingCodeInput(event.target.value));
            if (error) setError(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={BOOKING_CODE_LENGTH}
          placeholder="Booking Code"
          aria-invalid={error != null}
          className="min-w-0 flex-1 bg-transparent px-4 text-[15px] font-black tracking-[0.14em] text-white uppercase outline-none placeholder:text-[14px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-white/42 placeholder:normal-case"
        />
        <button
          type="submit"
          disabled={!isBookingCode(code) || loading}
          className="min-w-[76px] cursor-pointer border-l border-white/12 bg-[linear-gradient(180deg,#dedee2_0%,#aaaab0_100%)] px-3 text-[14px] font-black text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[9px] leading-4 font-semibold text-red-300/85">{error}</p>
      ) : null}
    </form>
  );
}
