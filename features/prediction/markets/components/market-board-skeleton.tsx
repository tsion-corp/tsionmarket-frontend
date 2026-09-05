export function MarketBoardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading sports markets" aria-busy="true">
      {[0, 1].map((section) => (
        <div
          key={section}
          className="overflow-hidden rounded-[10px] border border-white/8 bg-[#111114]"
        >
          <div className="h-14 animate-pulse bg-white/[0.055]" />
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="h-[70px] animate-pulse border-t border-white/6 bg-white/[0.018]"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
