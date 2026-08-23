interface IdenticonProps {
  seed: string;
  size?: number;
  className?: string;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function Identicon({ seed, size = 24, className }: IdenticonProps) {
  const normalizedSeed = seed.toLowerCase();
  const hue = hashSeed(normalizedSeed) % 360;
  const cells: Array<{ key: string; x: number; y: number }> = [];

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (hashSeed(`${normalizedSeed}:${x}:${y}`) % 2 === 0) continue;

      cells.push({ key: `${x}-${y}`, x, y });
      const mirroredX = 4 - x;
      if (mirroredX !== x) {
        cells.push({ key: `${mirroredX}-${y}`, x: mirroredX, y });
      }
    }
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      role="presentation"
      shapeRendering="crispEdges"
      viewBox="0 0 5 5"
      width={size}
    >
      <rect fill={`hsl(${hue} 28% 20%)`} height="5" width="5" />
      <g fill={`hsl(${hue} 72% 62%)`}>
        {cells.map((cell) => (
          <rect key={cell.key} height="1" width="1" x={cell.x} y={cell.y} />
        ))}
      </g>
    </svg>
  );
}
