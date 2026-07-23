import { ClockIcon } from "@/components/ui/icons";

interface ComingSoonProps {
  title: string;
  children: React.ReactNode;
}

// Tasteful placeholder for the fiat rails that are pending MoonPay verification.
// The surrounding screen still renders its real form so the layout is honest
// about what is coming.
export function ComingSoon({ title, children }: ComingSoonProps) {
  return (
    <div className="ws-inset mt-4 px-5 py-6 text-center">
      <span className="bg-accent/14 text-accent inline-grid h-[52px] w-[52px] place-items-center rounded-full">
        <ClockIcon size={24} />
      </span>
      <div className="ws-serif mt-3 text-[19px]">{title}</div>
      <p className="mx-auto mt-2 max-w-[32ch] text-[13px] leading-[1.55] font-normal text-white/60">
        {children}
      </p>
    </div>
  );
}
