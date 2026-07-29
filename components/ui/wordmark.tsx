import Link from "next/link";
import { TsionMark } from "@/components/ui/tsion-mark";

interface WordmarkProps {
  href?: string;
  suffix?: string;
  size?: "sm" | "md";
}

export function Wordmark({ href = "/", suffix, size = "md" }: WordmarkProps) {
  const mark = size === "md" ? 34 : 30;
  const label = size === "md" ? "text-[20px]" : "text-[19px]";
  return (
    <Link href={href} className="flex items-center gap-[11px] text-white">
      <TsionMark size={mark} />
      <span className={`ws-display tracking-[0.02em] ${label}`}>
        TSION
        {suffix ? (
          <span className="text-accent ml-2 align-middle font-sans text-[11px] font-medium tracking-[0.05em] not-italic">
            {suffix}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
