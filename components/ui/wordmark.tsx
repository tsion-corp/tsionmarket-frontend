import Link from "next/link";

interface WordmarkProps {
  href?: string;
  suffix?: string;
  size?: "sm" | "md";
}

export function Wordmark({ href = "/", suffix, size = "md" }: WordmarkProps) {
  const glyph = size === "md" ? "h-[34px] w-[34px] text-[20px]" : "h-8 w-8 text-[19px]";
  const label = size === "md" ? "text-[20px]" : "text-[19px]";
  return (
    <Link href={href} className="flex items-center gap-[11px] text-white">
      <span
        className={`grid place-items-center rounded-full border border-white/18 bg-white/8 ${glyph}`}
      >
        <span className="ws-display text-accent leading-none">w</span>
      </span>
      <span className={`ws-display tracking-[-0.01em] ${label}`}>
        World Street
        {suffix ? (
          <span className="text-accent ml-2 align-middle font-sans text-[11px] font-medium tracking-[0.05em] not-italic">
            {suffix}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
