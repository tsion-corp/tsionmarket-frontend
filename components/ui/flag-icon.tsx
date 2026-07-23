import { CURRENCY_COUNTRY } from "@/lib/currencies";

interface FlagIconProps {
  code: string;
  symbol: string;
  size?: number;
}

export function FlagIcon({ code, symbol, size = 28 }: FlagIconProps) {
  const country = CURRENCY_COUNTRY[code];
  if (!country) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full bg-white/8 font-sans text-[10px] font-semibold text-white/80"
        style={{ width: size, height: size }}
      >
        {symbol}
      </span>
    );
  }
  return (
    // flagcdn serves flags from its own host, so plain img with a graceful box.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w80/${country}.png`}
      alt={code}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full bg-white/6 object-cover"
      style={{ width: size, height: size }}
    />
  );
}
