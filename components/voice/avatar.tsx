interface AvatarProps {
  size?: number;
  className?: string;
}

// The voice assistant's face. A single instance is mounted (the floating voice
// button), so the mask/filter ids below don't need uniquing. Aspect ratio is
// 55x76; height is derived from the requested width.
export function VoiceAvatar({ size = 40, className }: AvatarProps) {
  const height = Math.round((size * 76) / 55);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 55 76"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <mask
        id="voice-avatar-mask"
        style={{ maskType: "alpha" }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="55"
        height="76"
      >
        <path
          d="M20.8615 2.11535C22.1893 6.09883 21.4469 9.66035 23.3401 10.3479C23.3401 10.3479 27.058 10.4364 29.2711 10.3479C31.4841 10.2594 31.1301 10.0823 31.6612 8.84303L32.3694 3.08907C34.7772 -2.50554 38.4479 0.757986 39.9823 3.08907C40.1239 3.86806 42.4019 8.3119 43.5232 10.4364C53.0128 18.9346 54.4409 28.495 53.9688 32.2129C54.3229 38.02 47.9198 43.0126 44.674 44.7831C44.6032 45.3496 45.2936 47.0257 45.6477 47.7929C46.8516 48.0761 49.1001 50.6256 50.0738 51.8649C53.7564 57.5303 50.546 59.5958 48.4804 59.9204V64.3465C48.4804 67.3563 43.6707 71.0742 41.6642 72.6676C40.8852 73.8007 38.5659 74.084 37.5037 74.084C29.5721 77.5541 20.5074 75.5299 16.9665 74.084C6.98116 71.5345 5.84217 62.9302 6.52084 58.9467C5.88348 59.3008 4.89793 58.7991 4.48483 58.5041C1.65211 57.5126 2.95044 54.5501 3.95369 53.1927L9.70764 46.8191C10.4158 45.8985 10.0027 45.0782 9.70764 44.7831C-6.93456 36.0725 1.53408 20.4985 7.84867 13.8003C9.83157 12.5256 13.16 5.47919 14.5764 2.11535C16.9665 -1.16 20.1533 0.61045 20.8615 2.11535Z"
          fill="url(#voice-avatar-fill)"
        />
      </mask>
      <g mask="url(#voice-avatar-mask)">
        <path
          d="M20.8615 2.11535C22.1893 6.09883 21.4469 9.66035 23.3401 10.3479C23.3401 10.3479 27.058 10.4364 29.2711 10.3479C31.4841 10.2594 31.1301 10.0823 31.6612 8.84303L32.3694 3.08907C34.7772 -2.50554 38.4479 0.757986 39.9823 3.08907C40.1239 3.86806 42.4019 8.3119 43.5232 10.4364C53.0128 18.9346 54.4409 28.495 53.9688 32.2129C54.3229 38.02 47.9198 43.0126 44.674 44.7831C44.6032 45.3496 45.2936 47.0257 45.6477 47.7929C46.8516 48.0761 49.1001 50.6256 50.0738 51.8649C53.7564 57.5303 50.546 59.5958 48.4804 59.9204V64.3465C48.4804 67.3563 43.6707 71.0742 41.6642 72.6676C40.8852 73.8007 38.5659 74.084 37.5037 74.084C29.5721 77.5541 20.5074 75.5299 16.9665 74.084C6.98116 71.5345 5.84217 62.9302 6.52084 58.9467C5.88348 59.3008 4.89793 58.7991 4.48483 58.5041C1.65211 57.5126 2.95044 54.5501 3.95369 53.1927L9.70764 46.8191C10.4158 45.8985 10.0027 45.0782 9.70764 44.7831C-6.93456 36.0725 1.53408 20.4985 7.84867 13.8003C9.83157 12.5256 13.16 5.47919 14.5764 2.11535C16.9665 -1.16 20.1533 0.61045 20.8615 2.11535Z"
          fill="#5A5A5A"
        />
        <ellipse cx="28.7699" cy="23.5469" rx="32.4877" ry="26.5567" fill="#DCDCDC" />
        <g filter="url(#voice-avatar-f0)">
          <ellipse
            cx="31.0714"
            cy="9.02964"
            rx="28.7698"
            ry="14.1636"
            transform="rotate(-1.48463 31.0714 9.02964)"
            fill="#F4F4F4"
          />
        </g>
        <g filter="url(#voice-avatar-f1)">
          <path
            d="M51.6082 60.9033C43.6766 66.3563 15.5501 63.1754 2.47833 60.9033L5.9307 78.4307C14.3698 80.3192 33.7444 83.4234 43.7297 80.7323C53.7151 78.0412 53.1426 66.3917 51.6082 60.9033Z"
            fill="#3C3C3C"
          />
        </g>
        <g opacity="0.83" filter="url(#voice-avatar-f2)">
          <path
            d="M5.66523 39.3923L3.09808 41.4283C17.0492 53.5382 41.0152 48.6577 51.2542 44.7037L52.6706 41.4283C32.275 51.4137 12.8355 44.2316 5.66523 39.3923Z"
            fill="#F4F4F4"
          />
        </g>
        <g opacity="0.83" filter="url(#voice-avatar-f3)">
          <path
            d="M9.47144 2.83301L6.9043 4.86902C20.8554 16.9789 44.8214 12.0983 55.0604 8.14435L56.4768 4.86902C36.0813 14.8543 16.6418 7.67223 9.47144 2.83301Z"
            fill="#F4F4F4"
          />
        </g>
        <g filter="url(#voice-avatar-f4)">
          <path
            d="M49.3956 45.5889L5.66559 47.1823L1.85913 53.4674L48.5989 54.5296L49.3956 45.5889Z"
            fill="#3C3C3C"
          />
        </g>
        <g opacity="0.48" filter="url(#voice-avatar-f5)">
          <path
            d="M45.9432 46.3857C34.9665 52.4053 14.9309 50.1332 6.28521 48.2447L5.0459 50.6348C20.6966 54.0341 39.5401 50.4578 47.0055 48.2447L45.9432 46.3857Z"
            fill="#3C3C3C"
          />
        </g>
        <g opacity="0.48" filter="url(#voice-avatar-f6)">
          <path
            d="M44.2612 52.582C44.7468 58.4282 46.2765 67.7455 48.5103 58.2455L44.2612 52.582Z"
            fill="#3C3C3C"
          />
        </g>
        <g filter="url(#voice-avatar-f7)">
          <path
            d="M45.6772 47.8018L42.6675 49.5722L44.792 54.3524C43.234 57.6809 46.7395 59.4572 48.687 59.9293C55.3262 57.6277 49.5132 50.2804 45.6772 47.8018Z"
            fill="#3C3C3C"
          />
          <path
            d="M45.6772 47.8018L42.6675 49.5722L44.792 54.3524C43.234 57.6809 46.7395 59.4572 48.687 59.9293C55.3262 57.6277 49.5132 50.2804 45.6772 47.8018Z"
            stroke="black"
            strokeWidth="0.177045"
          />
        </g>
        <g opacity="0.71" filter="url(#voice-avatar-f8)">
          <path
            d="M4.60339 52.4053C5.089 58.2514 6.61867 67.5687 8.85247 58.0687L4.60339 52.4053Z"
            fill="#3C3C3C"
          />
        </g>
        <g filter="url(#voice-avatar-f9)">
          <path
            d="M9.04291 47.625L12.0527 49.3954L9.92814 54.1757C11.4861 57.5041 7.98065 59.2804 6.03315 59.7526C-0.606023 57.451 5.20694 50.1036 9.04291 47.625Z"
            fill="#3C3C3C"
          />
          <path
            d="M9.04291 47.625L12.0527 49.3954L9.92814 54.1757C11.4861 57.5041 7.98065 59.2804 6.03315 59.7526C-0.606023 57.451 5.20694 50.1036 9.04291 47.625Z"
            stroke="black"
            strokeWidth="0.177045"
          />
        </g>
        <circle cx="13.5438" cy="34.2572" r="5.931" fill="#7A7A7A" />
        <path
          d="M10.7998 33.9913L8.85235 36.9125C8.71072 37.6207 9.85561 37.4436 10.4458 37.2666L14.5178 36.0273C15.0843 35.744 15.0489 35.9683 14.9604 36.1158L13.8096 37.2666C13.2431 38.1164 14.3407 38.0928 14.9604 37.9748L17.6161 35.2306C17.8993 34.4516 16.1997 34.5519 15.3145 34.6995L10.7998 35.6732L11.7736 34.4339C11.632 33.9382 11.0654 33.9323 10.7998 33.9913Z"
          fill="#F4F4F4"
        />
        <circle cx="40.1004" cy="34.2572" r="5.931" fill="#7A7A7A" />
        <path
          d="M38.7259 34.6681L37.5426 37.9735C37.5764 38.6949 38.6445 38.2463 39.1743 37.9318L42.8258 35.7446C43.307 35.3328 43.3269 35.5589 43.2767 35.7235L42.4383 37.1184C42.0941 38.08 43.1535 37.7917 43.7262 37.5273L45.6395 34.2224C45.726 33.398 44.1011 33.9063 43.2778 34.2636L39.1326 36.3001L39.7778 34.8621C39.5204 34.4153 38.9693 34.5466 38.7259 34.6681Z"
          fill="#F4F4F4"
        />
        <ellipse cx="19.3863" cy="30.4512" rx="1.85897" ry="2.47863" fill="#271C18" />
        <circle cx="19.7402" cy="29.3007" r="0.265567" fill="#7D6A66" />
        <ellipse cx="33.5501" cy="30.4512" rx="1.85897" ry="2.47863" fill="#271C18" />
        <circle cx="33.9044" cy="29.3007" r="0.265567" fill="#7D6A66" />
        <path
          d="M30.6285 36.3523C30.6285 37.2812 28.9243 38.4181 26.8221 38.4181C24.7198 38.4181 23.0156 37.2812 23.0156 36.3523C23.0156 35.4234 24.7198 36.3523 26.8221 36.3523C28.9243 36.3523 30.6285 35.4234 30.6285 36.3523Z"
          fill="#3C3C3C"
        />
      </g>
      <defs>
        <filter
          id="voice-avatar-f0"
          x="-6.93265"
          y="-14.3909"
          width="76.0084"
          height="46.8411"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="4.62087" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f1"
          x="-7.52457"
          y="50.9003"
          width="69.9997"
          height="40.8864"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="5.00151" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f2"
          x="-11.0831"
          y="25.2113"
          width="77.9353"
          height="38.075"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="7.09064" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f3"
          x="-7.27698"
          y="-11.3483"
          width="77.9348"
          height="38.075"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="7.09064" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f4"
          x="-13.5615"
          y="30.1683"
          width="78.3778"
          height="39.7821"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="7.7103" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f5"
          x="3.34627"
          y="44.6861"
          width="45.3587"
          height="9.04965"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="0.849814" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f6"
          x="43.1636"
          y="51.4844"
          width="6.44438"
          height="11.9329"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="0.548838" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f7"
          x="39.4387"
          y="44.5818"
          width="15.4761"
          height="18.5557"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="1.55799" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f8"
          x="3.50584"
          y="51.3076"
          width="6.44438"
          height="11.9329"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="0.548838" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id="voice-avatar-f9"
          x="-0.194661"
          y="44.405"
          width="15.4761"
          height="18.5557"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="1.55799" result="effect1_foregroundBlur" />
        </filter>
        <linearGradient
          id="voice-avatar-fill"
          x1="27.0238"
          y1="0"
          x2="27.0238"
          y2="76"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#BA90FF" />
          <stop offset="0.5" stopColor="#7E3BEB" />
          <stop offset="1" stopColor="#5320A8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
