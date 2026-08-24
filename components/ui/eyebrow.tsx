export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-eyebrow=""
      className="inline-flex items-center gap-2 text-[11.5px] font-medium tracking-[0.14em] text-white/55 uppercase"
    >
      <span className="bg-accent h-1 w-1 shrink-0 rounded-full" />
      {children}
    </div>
  );
}
