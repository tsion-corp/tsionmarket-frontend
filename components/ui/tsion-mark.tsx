interface TsionMarkProps {
  size?: number;
  className?: string;
}

// The TSION brand mark: the metallic squircle logo. Rendered as a plain img from
// public/ so its embedded SVG filters and gradient ids never collide when the
// mark appears more than once on a page (header, footer, auth).
export function TsionMark({ size = 34, className }: TsionMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/tsion-logo.svg"
      alt="TSION"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
