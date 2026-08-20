import { cn } from "@/lib/utils";

interface LotteryBallProps {
  number: number;
  arkball?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** fluid fills its grid cell up to the md size, for the picker's tight phone grid. */
  size?: "sm" | "md" | "fluid";
}

export function LotteryBall({
  number,
  arkball = false,
  selected = false,
  disabled = false,
  onClick,
  size = "md",
}: LotteryBallProps) {
  const interactive = !!onClick;
  const className = cn(
    "tnum relative inline-grid shrink-0 place-items-center rounded-full border font-sans font-extrabold transition",
    size === "sm"
      ? "h-9 w-9 text-[13px]"
      : size === "fluid"
        ? "aspect-square h-auto w-full max-w-11 text-[13px] sm:max-w-12 sm:text-[14px]"
        : "h-11 w-11 text-[14px] sm:h-12 sm:w-12",
    arkball
      ? "border-red-300/45 bg-[radial-gradient(circle_at_33%_24%,#ff8a92_0%,#e31d35_28%,#980c20_74%,#520611_100%)] text-white shadow-[inset_-6px_-8px_14px_rgba(0,0,0,0.35),0_6px_15px_rgba(220,20,48,0.2)]"
      : "border-white/35 bg-[radial-gradient(circle_at_32%_23%,#ffffff_0%,#f3f3ef_34%,#c5c8ca_72%,#85898c_100%)] text-[#111417] shadow-[inset_-6px_-8px_13px_rgba(0,0,0,0.16),0_6px_15px_rgba(0,0,0,0.2)]",
    selected &&
      (arkball
        ? "ring-2 ring-red-300 ring-offset-2 ring-offset-[#101113]"
        : "ring-2 ring-amber-300 ring-offset-2 ring-offset-[#101113]"),
    interactive && !disabled && "cursor-pointer hover:-translate-y-0.5 hover:brightness-110",
    disabled && "cursor-not-allowed opacity-30"
  );

  if (!interactive) return <span className={className}>{number}</span>;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${arkball ? "ArkBall" : "White ball"} ${number}`}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {number}
    </button>
  );
}
