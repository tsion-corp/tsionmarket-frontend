import Link from "next/link";
import { ArkMark } from "@/components/ui/ark-mark";

interface WordmarkProps {
  href?: string;
  suffix?: string;
  size?: "sm" | "md";
}

// The brand lockup. The Ark logo is itself the wordmark, so no text sits next
// to it; the optional suffix still tags contexts like a beta label.
export function Wordmark({ href = "/", suffix, size = "md" }: WordmarkProps) {
  return (
    <Link href={href} className="flex items-center gap-2 text-white">
      <ArkMark height={size === "md" ? 22 : 19} />
      {suffix ? (
        <span className="text-accent align-middle font-sans text-[11px] font-medium tracking-[0.05em]">
          {suffix}
        </span>
      ) : null}
    </Link>
  );
}
