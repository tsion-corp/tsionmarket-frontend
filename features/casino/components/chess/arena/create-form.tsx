"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateArena } from "@/features/casino/hooks/use-casino-arena";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const CLOCKS = [
  { label: "1 + 0", note: "Bullet", initialSeconds: 60, incrementSeconds: 0 },
  { label: "3 + 0", note: "Blitz", initialSeconds: 180, incrementSeconds: 0 },
  { label: "3 + 2", note: "Blitz", initialSeconds: 180, incrementSeconds: 2 },
  { label: "5 + 3", note: "Rapid", initialSeconds: 300, incrementSeconds: 3 },
  { label: "10 + 0", note: "Rapid", initialSeconds: 600, incrementSeconds: 0 },
] as const;

const DURATIONS = [20, 30, 45, 60, 90, 120] as const;
const START_DELAYS = [
  { label: "Now", seconds: 0 },
  { label: "1 min", seconds: 60 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
] as const;

function ChoiceButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[9px] border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-[#858e95]/65 bg-[linear-gradient(180deg,rgba(151,160,167,0.19),rgba(88,96,102,0.11))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/[0.08] bg-black/10 text-white/52 hover:border-white/15 hover:text-white/78"
      }`}
    >
      {children}
    </button>
  );
}

export function ArenaCreateForm() {
  const router = useRouter();
  const { login } = usePrivy();
  const wallet = useCasinoWallet();
  const create = useCreateArena();
  const [name, setName] = useState("");
  const [clockIndex, setClockIndex] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [startDelaySeconds, setStartDelaySeconds] = useState(60);
  const [touched, setTouched] = useState(false);

  const cleanName = name.trim();
  const nameError =
    cleanName.length < 3
      ? "Use at least 3 characters."
      : cleanName.length > 60
        ? "Keep the name under 60 characters."
        : null;

  const submit = async () => {
    setTouched(true);
    if (!wallet.connected) {
      login();
      return;
    }
    if (nameError || create.isPending) return;
    const clock = CLOCKS[clockIndex];
    const toastId = toast.loading("Creating Arena…");
    try {
      const arena = await create.mutateAsync({
        name: cleanName,
        initialSeconds: clock.initialSeconds,
        incrementSeconds: clock.incrementSeconds,
        durationMinutes,
        maxPlayers: 10_000,
        startDelaySeconds,
      });
      toast.success("Arena created.", { id: toastId });
      router.push(`/casino/chess/tournaments/${arena.id}?created=1`);
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't create the Arena."), { id: toastId });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 pt-7 pb-20 sm:px-6 sm:pt-10">
      <div className="mb-7">
        <div className="mb-2 text-[10px] font-bold tracking-[0.18em] text-[#aeb5ba] uppercase">
          Free-entry competition
        </div>
        <h1 className="font-serif text-[clamp(29px,5vw,42px)] font-bold tracking-[-0.035em] text-white">
          Create an Arena
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-white/46">
          Players are paired continuously until the tournament clock reaches zero.
        </p>
      </div>

      <div className="overflow-hidden rounded-[15px] border border-white/[0.08] bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="space-y-7 p-5 sm:p-7">
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold tracking-[0.08em] text-white/42 uppercase">
              Tournament name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={60}
              autoFocus
              placeholder="Friday Night Arena"
              className="h-12 w-full rounded-[9px] border border-white/[0.09] bg-black/20 px-4 text-[15px] text-white outline-none placeholder:text-white/24 focus:border-[#858e95]/70"
            />
            {touched && nameError ? (
              <span className="mt-2 block text-[11.5px] text-[#e39b8d]">{nameError}</span>
            ) : null}
          </label>

          <fieldset>
            <legend className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-white/42 uppercase">
              Clock
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CLOCKS.map((clock, index) => (
                <ChoiceButton
                  key={clock.label}
                  selected={clockIndex === index}
                  onClick={() => setClockIndex(index)}
                >
                  <span className="tnum block text-[14px] font-bold">{clock.label}</span>
                  <span className="mt-0.5 block text-[10px] text-white/36">{clock.note}</span>
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-white/42 uppercase">
              Arena duration
            </legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {DURATIONS.map((duration) => (
                <ChoiceButton
                  key={duration}
                  selected={durationMinutes === duration}
                  onClick={() => setDurationMinutes(duration)}
                >
                  <span className="tnum block text-center text-[13px] font-bold">
                    {duration < 60 ? `${duration}m` : `${duration / 60}h`}
                  </span>
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-white/42 uppercase">
              Starts in
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {START_DELAYS.map((delay) => (
                <ChoiceButton
                  key={delay.seconds}
                  selected={startDelaySeconds === delay.seconds}
                  onClick={() => setStartDelaySeconds(delay.seconds)}
                >
                  <span className="block text-center text-[13px] font-bold">{delay.label}</span>
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 rounded-[10px] border border-white/[0.07] bg-black/15 px-4 py-3 text-[11.5px] text-white/43 sm:grid-cols-3">
            <span>
              <b className="text-white/70">10,000</b> player capacity
            </span>
            <span>
              <b className="text-white/70">Free</b> entry
            </span>
            <span>
              <b className="text-white/70">Automatic</b> pairings
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-black/10 px-5 py-4 sm:px-7">
          <p className="text-[11px] text-white/34">
            No deposits or prizes are attached to this Arena.
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={create.isPending}
            className="rounded-[9px] border border-[#858e95]/70 bg-[linear-gradient(145deg,#626b72_0%,#343a3f_100%)] px-6 py-3 text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_26px_rgba(0,0,0,0.26)] transition-opacity disabled:opacity-50"
          >
            {!wallet.connected
              ? "Connect to create"
              : create.isPending
                ? "Creating…"
                : "Create Arena"}
          </button>
        </div>
      </div>
    </div>
  );
}
