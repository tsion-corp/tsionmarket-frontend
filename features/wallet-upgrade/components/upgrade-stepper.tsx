import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { AuthMode } from "@/lib/wallet-upgrade/environment";
import type { Step, StepId } from "../lib/steps";

/**
 * Where the person is in the upgrade. Two shapes of the same thing: a vertical
 * rail beside the content on a wide screen, and a segmented bar with the
 * current step named above it on a phone, where a six-row list would push the
 * action off the screen.
 */

const SHORT: Record<StepId, string> = {
  clerk: "New account",
  decane: "Current account",
  link: "Connect",
  wallet: "Create wallet",
  recovery: "Recovery secret",
  funds: "Move funds",
};

// Under Decane the one sign-in is simply "Sign in", not the second of two accounts.
export const shortLabel = (id: StepId, auth: AuthMode = "clerk"): string =>
  id === "decane" && auth === "decane" ? "Sign in" : SHORT[id];

export function UpgradeStepper({
  steps,
  currentId,
  auth = "clerk",
}: {
  steps: ReadonlyArray<Step>;
  currentId: StepId | null;
  auth?: AuthMode;
}) {
  const done = steps.filter((step) => step.state === "done").length;
  const currentIndex = steps.findIndex((step) => step.id === currentId);

  return (
    <nav aria-label="Upgrade progress">
      {/* Phone: one line of words, one bar. */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-white">
            {currentId ? shortLabel(currentId, auth) : "All done"}
          </span>
          <span className="text-white/45">
            {currentId
              ? `Step ${currentIndex + 1} of ${steps.length}`
              : `${done} of ${steps.length}`}
          </span>
        </div>
        <ol
          className="mt-3 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {steps.map((step) => (
            <li
              key={step.id}
              className={cn(
                "h-1 rounded-full transition-colors",
                step.state === "done" && "bg-upgrade",
                step.id === currentId && step.state !== "done" && "bg-white/70",
                step.state !== "done" && step.id !== currentId && "bg-white/12"
              )}
            />
          ))}
        </ol>
      </div>

      {/* Desktop: the rail. */}
      <div className="hidden lg:block">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[11.5px] font-medium tracking-[0.14em] text-white/45 uppercase">
            Your progress
          </h2>
          <span className="text-[12.5px] text-white/45">
            {done} of {steps.length}
          </span>
        </div>
        <ol className="relative flex flex-col">
          {steps.map((step, index) => {
            const isCurrent = step.id === currentId;
            const last = index === steps.length - 1;
            return (
              <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
                {!last ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-8 left-[13px] h-[calc(100%-2rem)] w-px",
                      step.state === "done" ? "bg-upgrade/70" : "bg-white/12"
                    )}
                  />
                ) : null}
                <Node step={step} index={index + 1} current={isCurrent} />
                <div className="min-w-0 pt-0.5">
                  <div
                    className={cn(
                      "text-[14.5px] leading-tight",
                      isCurrent && "font-semibold text-white",
                      step.state === "done" && "text-white/65",
                      !isCurrent && step.state !== "done" && "text-white/40"
                    )}
                  >
                    {shortLabel(step.id, auth)}
                  </div>
                  {step.state === "unavailable" ? (
                    <div className="mt-1 text-[12px] text-white/35">Not available yet</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

function Node({ step, index, current }: { step: Step; index: number; current: boolean }) {
  const base = "relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-[12px]";
  if (step.state === "done") {
    return (
      <span className={cn(base, "bg-upgrade text-ink")} aria-label="Done">
        <CheckIcon size={14} />
      </span>
    );
  }
  if (current) {
    return (
      <span
        className={cn(
          base,
          "text-ink bg-white font-semibold shadow-[0_0_0_5px_rgba(255,255,255,0.12)]"
        )}
        aria-current="step"
      >
        {index}
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "border bg-black text-white/40",
        step.state === "unavailable" ? "border-dashed border-white/15" : "border-white/15"
      )}
    >
      {index}
    </span>
  );
}
