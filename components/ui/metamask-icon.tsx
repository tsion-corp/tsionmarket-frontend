interface MetaMaskIconProps {
  size?: number;
  className?: string;
}

// A stylized fox mark in MetaMask's brand palette, not a reproduction of
// their trademarked asset, just enough to read as "MetaMask" next to a label.
export function MetaMaskIcon({ size = 24, className }: MetaMaskIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path d="M6 6 17 15 14 19 8 17Z" fill="#E4761B" />
      <path d="M34 6 23 15 26 19 32 17Z" fill="#E4761B" />
      <path
        d="M20 12 28 17 30 27 25 33 15 33 10 27 12 17Z"
        fill="#F6851B"
        stroke="#D7C1B3"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path d="M15 24 25 24 22 30 18 30Z" fill="#FCD9BD" />
      <circle cx="16.5" cy="21" r="1.6" fill="#233447" />
      <circle cx="23.5" cy="21" r="1.6" fill="#233447" />
    </svg>
  );
}
