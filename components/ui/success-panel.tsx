import { CheckIcon } from "@/components/ui/icons";

interface SuccessPanelProps {
  title: string;
  children: React.ReactNode;
  onDone: () => void;
}

export function SuccessPanel({ title, children, onDone }: SuccessPanelProps) {
  return (
    <div className="pt-1.5 pb-0.5 text-center">
      <span className="border-up/40 bg-up/14 text-up inline-grid h-[60px] w-[60px] place-items-center rounded-full border">
        <CheckIcon size={30} />
      </span>
      <div className="ws-display mt-4 text-[26px] tracking-[-0.01em]">{title}</div>
      <p className="mx-auto mt-2.5 max-w-[34ch] text-sm leading-[1.55] font-normal text-white/70">
        {children}
      </p>
      <button
        onClick={onDone}
        className="ws-chrome text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
      >
        Done
      </button>
    </div>
  );
}
