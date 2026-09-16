"use client";

/**
 * The Square's own glyphs, carried over verbatim from
 * market-square-frontend/components/ui (icons.tsx, room-icons.tsx,
 * topic-tags-field.tsx). The page at /square is the Square's Home drawn as
 * the Square draws it, so its icons are the Square's exports rather than
 * redrawings of them. Only the glyphs Home's cards use are here.
 */

interface IconProps {
  className?: string;
}

interface NavIconProps extends IconProps {
  filled?: boolean;
}

function base(className?: string, filled = false) {
  return {
    className,
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: filled ? 1 : 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

export function IconStats({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 19.5V13M9.5 19.5V8M14.5 19.5v-9M19.5 19.5V4.5" />
    </svg>
  );
}

export function IconLive({ className, filled }: NavIconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3.2" fill={filled ? "currentColor" : "none"} />
      <path
        d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2"
        strokeWidth={filled ? 2.2 : 1.6}
      />
      <path
        d="M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8"
        strokeWidth={filled ? 2.2 : 1.6}
      />
    </svg>
  );
}

export function IconImage({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="8.75" cy="9.5" r="1.4" />
      <path d="m4 16.5 4.5-4.2 3.6 3.3 3.2-2.8 4.7 4.2" />
    </svg>
  );
}

/** KASH coin: a ring with a bar, the currency mark used on gift prices. */
export function IconCoin({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 9.2h5.6M9.2 14.8h5.6M12 8v8" strokeWidth={1.4} />
    </svg>
  );
}

export function IconStore({ className, filled }: NavIconProps) {
  return (
    <svg {...base(className, filled)}>
      <path d="M4.5 9.5 6 4h12l1.5 5.5M4.5 9.5h15M4.5 9.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 20v-6h5v6" fill={filled ? "#000" : "none"} />
    </svg>
  );
}

export function IconVolume({ className, muted }: IconProps & { muted?: boolean }) {
  return (
    <svg {...base(className)}>
      <path d="M4 9.5h3L12 5.5v13L7 14.5H4z" />
      {muted ? (
        <path d="M16 9.5l4 5M20 9.5l-4 5" />
      ) : (
        <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
      )}
    </svg>
  );
}

export function IconSpark({ className, filled }: NavIconProps) {
  return (
    <svg {...base(className, filled)}>
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

/** The 24px badge on a gist-room invite card — node 225:3877. The disc's own `#9F65FD -> #7E3BEB` gradient is the purple ramp's two stops, kept as the file draws them. */
export function IconRoomBadgeMic({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="12" fill="url(#room_mic_badge_paint0_linear_225_3877)" />
      <g clipPath="url(#room_mic_badge_clip0_225_3877)">
        <path
          d="M13.501 8.50195C13.501 7.67353 12.8294 7.00195 12.001 7.00195C11.1725 7.00195 10.501 7.67353 10.501 8.50195V11.502C10.501 12.3304 11.1725 13.002 12.001 13.002C12.8294 13.002 13.501 12.3304 13.501 11.502V8.50195Z"
          fill="white"
          stroke="white"
          strokeWidth="0.750607"
        />
        <path
          d="M8.50146 7.50195V8.50195M6.50146 7.00195V9.00195M15.5015 7.50195V8.50195M17.5015 7.00195V9.00195M8.50146 11.002V11.502C8.50146 12.4302 8.87021 13.3204 9.52659 13.9768C10.183 14.6332 11.0732 15.002 12.0015 15.002M12.0015 15.002C12.9297 15.002 13.82 14.6332 14.4763 13.9768C15.1327 13.3204 15.5015 12.4302 15.5015 11.502V11.002M12.0015 15.002V17.002M12.0015 17.002H10.5015M12.0015 17.002H13.5015"
          stroke="white"
          strokeWidth="0.750607"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <linearGradient
          id="room_mic_badge_paint0_linear_225_3877"
          x1="12"
          y1="0"
          x2="12"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9F65FD" />
          <stop offset="1" stopColor="#7E3BEB" />
        </linearGradient>
        <clipPath id="room_mic_badge_clip0_225_3877">
          <rect width="12" height="12" fill="white" transform="translate(6 6)" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** `codicon:voice-mode-compact` — the waveform on the invite card's Join Gistroom pill, node 225:3885. */
export function IconVoiceMode({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#voice_mode_clip0_225_3885)">
        <path
          d="M3.33219 0.333333V7.66667C3.33219 7.85333 3.18553 8 2.99886 8C2.81219 8 2.66553 7.85333 2.66553 7.66667V0.333333C2.66553 0.146667 2.81219 0 2.99886 0C3.18553 0 3.33219 0.146667 3.33219 0.333333ZM4.99886 1.33333C4.81219 1.33333 4.66553 1.48 4.66553 1.66667V6.33333C4.66553 6.52 4.81219 6.66667 4.99886 6.66667C5.18553 6.66667 5.33219 6.52 5.33219 6.33333V1.66667C5.33219 1.48 5.18553 1.33333 4.99886 1.33333ZM6.99886 2.66667C6.81219 2.66667 6.66553 2.81333 6.66553 3V5C6.66553 5.18667 6.81219 5.33333 6.99886 5.33333C7.18553 5.33333 7.33219 5.18667 7.33219 5V3C7.33219 2.81333 7.18553 2.66667 6.99886 2.66667ZM0.998861 2C0.812194 2 0.665527 2.14667 0.665527 2.33333V5.66667C0.665527 5.85333 0.812194 6 0.998861 6C1.18553 6 1.33219 5.85333 1.33219 5.66667V2.33333C1.33219 2.14667 1.18553 2 0.998861 2Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="voice_mode_clip0_225_3885">
          <rect width="8" height="8" fill="currentColor" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** `fa-solid:church` — node 415:12685 on the gist room card, exported from the file. */
export function IconTopicChurch({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 7 6"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#topic_church_clip)">
        <path
          d="M5.08032 2.69822L3.85022 1.96011V1.40008H4.37525C4.47194 1.40008 4.55026 1.32176 4.55026 1.22507V0.87505C4.55026 0.778357 4.47194 0.70004 4.37525 0.70004H3.85022V0.17501C3.85022 0.078317 3.7719 0 3.67521 0H3.32519C3.2285 0 3.15018 0.078317 3.15018 0.17501V0.70004H2.62515C2.52846 0.70004 2.45014 0.778357 2.45014 0.87505V1.22507C2.45014 1.32176 2.52846 1.40008 2.62515 1.40008H3.15018V1.96011L1.92008 2.69822C1.86824 2.72931 1.82534 2.7733 1.79555 2.8259C1.76576 2.87849 1.7501 2.93791 1.7501 2.99836V5.60032H2.80016V4.55026C2.80016 4.1636 3.11354 3.85022 3.5002 3.85022C3.88686 3.85022 4.20024 4.1636 4.20024 4.55026V5.60032H5.2503V2.99836C5.2503 2.87541 5.18576 2.76144 5.08032 2.69822ZM0 4.33106V5.42531C0 5.522 0.078317 5.60032 0.17501 5.60032H1.40008V3.5002L0.21209 4.00926C0.149142 4.03628 0.0954991 4.08117 0.0578019 4.13836C0.0201048 4.19556 8.2568e-06 4.26256 0 4.33106ZM6.78831 4.00926L5.60032 3.5002V5.60032H6.82539C6.92208 5.60032 7.0004 5.522 7.0004 5.42531V4.33106C7.0004 4.19105 6.91694 4.0645 6.78831 4.00926Z"
          fill="url(#topic_church_paint)"
        />
      </g>
      <defs>
        <linearGradient
          id="topic_church_paint"
          x1="3.5002"
          y1="0"
          x2="3.5002"
          y2="5.60032"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#666666" />
        </linearGradient>
        <clipPath id="topic_church_clip">
          <rect width="6.31579" height="5.05263" fill="white" transform="scale(1.1084)" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** `famicons:fast-food-sharp` — node 415:12689 on the gist room card, exported from the file. */
export function IconTopicFood({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 6 6"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#topic_food_clip)">
        <path
          d="M1.20023 4.12717L1.68032 4.53653L2.16042 4.12717H4.50058V4.40781C4.50207 4.56534 4.45124 4.71893 4.35678 4.84499C4.25542 4.97659 4.10892 5.06124 3.94627 5.06417C3.91776 5.24122 3.8493 5.40167 3.74565 5.52687C3.59226 5.71228 3.36854 5.81446 3.11712 5.81446H1.57016C1.31895 5.81432 1.09608 5.71192 0.942791 5.52687C0.839109 5.40163 0.770662 5.2413 0.742172 5.06417C0.435968 5.05842 0.187862 4.76628 0.187862 4.40781V4.12717H1.20023ZM5.18013 0.527638L4.65713 0.707383L4.55276 1.12486H5.81214V1.50058H5.59412L5.16738 5.54426C5.14386 5.71963 5.06228 5.81321 4.87514 5.8133H3.9915C4.00601 5.79761 4.02059 5.78121 4.0344 5.76459C4.12855 5.64947 4.20198 5.51875 4.25126 5.37843C4.39599 5.32114 4.52458 5.22862 4.62466 5.10939C4.78631 4.91819 4.87512 4.66836 4.87514 4.40665C4.8751 4.26891 4.84914 4.13168 4.79977 4.00309C4.8839 3.81625 4.89812 3.60526 4.83804 3.40935C4.77789 3.21331 4.64737 3.04605 4.47275 2.93854C4.44877 2.80579 4.40695 2.67695 4.34751 2.55586C4.2511 2.36079 4.11163 2.19006 3.93931 2.05721C3.62929 1.81561 3.22269 1.68732 2.76575 1.68728H2.67878L2.65675 1.50058H2.43757V1.12486H4.1666L4.33591 0.422111L5.06185 0.187862L5.18013 0.527638ZM2.76575 2.06417C3.13899 2.06417 3.46572 2.16493 3.7097 2.35524C3.97307 2.55978 4.1152 2.85072 4.12486 3.1983C4.23062 3.22004 4.32559 3.27819 4.39389 3.36181C4.46212 3.44539 4.50036 3.54963 4.50058 3.65752V3.75145H2.13259L1.68032 4.08195L1.23038 3.75145H0.187862V3.65752C0.188078 3.54976 0.225321 3.44534 0.29339 3.36181C0.361619 3.27823 0.456769 3.22011 0.562428 3.1983C0.58093 2.51839 1.12333 2.06417 1.92269 2.06417H2.76575Z"
          fill="url(#topic_food_paint)"
        />
      </g>
      <defs>
        <linearGradient
          id="topic_food_paint"
          x1="5.20438"
          y1="0.273522"
          x2="2.93623"
          y2="7.31358"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#666666" />
        </linearGradient>
        <clipPath id="topic_food_clip">
          <rect width="5.05263" height="5.05263" fill="white" transform="scale(1.18748)" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Which glyph a topic key wears on a room card, as the Square maps them. */
export const TOPIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  gaming: IconPlay,
  trading: IconStats,
  shows: IconLive,
  arts: IconSpark,
  pictures: IconImage,
  reels: IconPlay,
  crypto: IconCoin,
  business: IconStore,
  music: IconVolume,
  religion: IconTopicChurch,
  food: IconTopicFood,
};

/** `vuesax/linear/search-normal`, 16px — the top bar's search field. */
export function IconTopSearch({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.66683 14.0007C11.1646 14.0007 14.0002 11.1651 14.0002 7.66732C14.0002 4.16951 11.1646 1.33398 7.66683 1.33398C4.16903 1.33398 1.3335 4.16951 1.3335 7.66732C1.3335 11.1651 4.16903 14.0007 7.66683 14.0007Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.6668 14.6673L13.3335 13.334"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
