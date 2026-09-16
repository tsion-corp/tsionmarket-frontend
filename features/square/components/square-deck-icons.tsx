"use client";

/**
 * The people deck's controls, carried over verbatim from
 * market-square-frontend/components/ui/home-icons.tsx and pal-crown.tsx:
 * the follow badge, the pass and wink discs, and the crown a verified
 * account wears beside its name.
 */

/** The `#7E3BEB` add badge pinned to a deck card's top-right — node 225:3412. */
export function IconDeckAdd({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="39.9999" height="39.9999" rx="19.5634" fill="#7E3BEB" />
      <path
        d="M26.3197 28.0225H22.4309C22.0322 28.0225 21.7017 27.6919 21.7017 27.2933C21.7017 26.8947 22.0322 26.5642 22.4309 26.5642H26.3197C26.7183 26.5642 27.0489 26.8947 27.0489 27.2933C27.0489 27.6919 26.7183 28.0225 26.3197 28.0225Z"
        fill="white"
      />
      <path
        d="M24.3756 29.9666C23.977 29.9666 23.6465 29.636 23.6465 29.2374V25.3485C23.6465 24.9499 23.977 24.6194 24.3756 24.6194C24.7743 24.6194 25.1048 24.9499 25.1048 25.3485V29.2374C25.1048 29.636 24.7743 29.9666 24.3756 29.9666Z"
        fill="white"
      />
      <path
        d="M20.1563 19.6322C20.1272 19.6322 20.1077 19.6322 20.0786 19.6322C20.0299 19.6224 19.9619 19.6224 19.9036 19.6322C17.0841 19.5447 14.955 17.328 14.955 14.5961C14.9452 13.2544 15.4702 11.9905 16.423 11.0377C17.3758 10.085 18.6397 9.55024 19.9911 9.55024C22.7716 9.55024 25.0369 11.8155 25.0369 14.5961C25.0369 17.328 22.9077 19.5349 20.1855 19.6322C20.1758 19.6322 20.1661 19.6322 20.1563 19.6322ZM19.9911 11.0086C19.0286 11.0086 18.1341 11.3877 17.4536 12.0586C16.7827 12.7391 16.4133 13.6336 16.4133 14.5863C16.4133 16.5308 17.9299 18.1058 19.8647 18.1641C19.923 18.1544 20.0494 18.1544 20.1758 18.1641C22.091 18.0766 23.5785 16.5113 23.5785 14.5863C23.5785 12.6225 21.9647 11.0086 19.9911 11.0086Z"
        fill="white"
      />
      <path
        d="M19.9906 30.2669C18.0073 30.2669 16.1309 29.7516 14.7114 28.7988C13.3601 27.8947 12.6212 26.66 12.6212 25.328C12.6212 23.9961 13.3698 22.7711 14.7114 21.8766C17.6184 19.9322 22.3434 19.9322 25.2503 21.8766C25.5809 22.1002 25.6781 22.5572 25.4545 22.8877C25.2309 23.228 24.7739 23.3155 24.4434 23.0919C22.0225 21.478 17.9392 21.478 15.5184 23.0919C14.5851 23.7141 14.0795 24.5016 14.0795 25.328C14.0795 26.1544 14.5851 26.9613 15.5184 27.5836C16.6948 28.3711 18.2795 28.7988 19.9809 28.7988C20.3795 28.7988 20.71 29.1294 20.71 29.528C20.71 29.9266 20.3892 30.2669 19.9906 30.2669Z"
        fill="white"
      />
    </svg>
  );
}

/** PASS — node 225:3409. A rotated squircle at `#9F65FD` 23% with a cross. */
export function IconDeckPass({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 46 46"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="11.1657"
        width="36.5798"
        height="36.5798"
        rx="17.9257"
        transform="rotate(17.773 11.1657 0)"
        fill="#9F65FD"
        fillOpacity="0.23"
      />
      <path
        d="M29.8128 28.3765C30.0035 28.5672 30.1106 28.8258 30.1106 29.0954C30.1106 29.3651 30.0035 29.6237 29.8128 29.8144C29.6221 30.005 29.3635 30.1122 29.0939 30.1122C28.8242 30.1122 28.5656 30.005 28.375 29.8144L23.005 24.4427L17.6333 29.8127C17.4426 30.0033 17.184 30.1105 16.9144 30.1105C16.6447 30.1105 16.3861 30.0033 16.1954 29.8127C16.0047 29.622 15.8976 29.3634 15.8976 29.0937C15.8976 28.8241 16.0047 28.5655 16.1954 28.3748L21.5671 23.0048L16.1971 17.6331C16.0064 17.4425 15.8993 17.1839 15.8993 16.9142C15.8993 16.6446 16.0064 16.3859 16.1971 16.1953C16.3878 16.0046 16.6464 15.8975 16.916 15.8975C17.1857 15.8975 17.4443 16.0046 17.635 16.1953L23.005 21.567L28.3766 16.1944C28.5673 16.0038 28.8259 15.8966 29.0956 15.8966C29.3652 15.8966 29.6238 16.0038 29.8145 16.1944C30.0052 16.3851 30.1123 16.6437 30.1123 16.9134C30.1123 17.183 30.0052 17.4416 29.8145 17.6323L24.4428 23.0048L29.8128 28.3765Z"
        fill="#7E3BEB"
      />
    </svg>
  );
}

/** WINK — node 225:3407. The same squircle on the file's vertical `#9F65FD -> #7E3BEB` ramp, carrying the winking face. */
export function IconDeckWink({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 46 46"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="11.1657"
        width="36.5798"
        height="36.5798"
        rx="17.9257"
        transform="rotate(17.773 11.1657 0)"
        fill="url(#deck_wink_paint0_linear_225_3407)"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.8829 19.7979C19.8013 18.8626 18.9767 18.1708 18.0415 18.2528C17.1068 18.3347 16.4155 19.1587 16.497 20.0934C16.5786 21.0281 17.4023 21.7198 18.337 21.6386C19.2723 21.5574 19.9645 20.7331 19.8829 19.7979ZM18.1566 19.3814C18.4665 19.363 18.7333 19.598 18.7542 19.9077C18.7751 20.2175 18.5423 20.4861 18.2327 20.5094C17.9196 20.5331 17.6473 20.297 17.6262 19.9838C17.605 19.6705 17.8432 19.4001 18.1566 19.3814Z"
        fill="white"
      />
      <path
        d="M28.8899 18.1884C29.1376 18.1908 29.3287 18.2863 29.4489 18.5115C29.5245 18.6522 29.5403 18.8174 29.4923 18.9698C29.4575 19.0783 29.3923 19.1745 29.3045 19.2472C29.187 19.3457 28.8805 19.4847 28.7301 19.5595C28.435 19.7055 28.1407 19.8533 27.8473 20.0027C27.8667 20.0119 27.8858 20.0212 27.905 20.0307L28.7268 20.4416C29.0067 20.5816 29.3875 20.7061 29.4896 21.0265C29.5379 21.1787 29.5245 21.3437 29.4523 21.4862C29.3807 21.6288 29.2547 21.7367 29.1027 21.7857C28.8239 21.8749 28.6245 21.748 28.3839 21.6246L26.9193 20.8934C26.6569 20.7625 26.3369 20.6222 26.1006 20.4569C25.855 20.2851 25.8265 19.8408 26.0256 19.6213C26.1787 19.4524 26.4657 19.3362 26.6772 19.2311L27.4566 18.8421L28.2157 18.4617C28.4175 18.3607 28.6673 18.2092 28.8899 18.1884Z"
        fill="white"
      />
      <path
        d="M17.8097 24.1954C17.8895 24.1912 17.9878 24.2065 18.062 24.234C18.4437 24.375 18.4773 24.6913 18.5855 25.0271C18.6374 25.1855 18.6988 25.3407 18.7695 25.4918C19.298 26.6268 20.2599 27.5023 21.4395 27.9218C22.6067 28.3348 23.8899 28.2695 25.0093 27.7401C25.989 27.274 26.7769 26.4826 27.2386 25.5007C27.3699 25.2144 27.4442 24.9662 27.5375 24.6684C27.5938 24.4887 27.7199 24.3352 27.8947 24.2555C28.0607 24.1805 28.25 24.1751 28.4199 24.2411C28.5831 24.3046 28.7143 24.4306 28.7844 24.5911C28.823 24.6787 28.8418 24.7736 28.8396 24.8693C28.8338 25.0982 28.6318 25.6153 28.5451 25.8405C28.3346 26.3393 28.059 26.8081 27.7255 27.2347C26.7371 28.4894 25.29 29.2992 23.7036 29.4853C22.1306 29.6686 20.5488 29.2241 19.3014 28.2484C18.433 27.569 17.7694 26.6625 17.3841 25.6293C17.3158 25.4512 17.1917 25.1023 17.1736 24.9179C17.1337 24.5117 17.438 24.2324 17.8097 24.1954Z"
        fill="white"
      />
      <path
        d="M35.1845 23.0045C35.1845 29.731 29.7315 35.184 23.005 35.184C16.2784 35.184 10.8254 29.731 10.8254 23.0045C10.8254 16.2779 16.2784 10.8249 23.005 10.8249C29.7315 10.8249 35.1845 16.2779 35.1845 23.0045ZM12.1375 23.0045C12.1375 29.0064 17.003 33.872 23.005 33.872C29.0069 33.872 33.8725 29.0064 33.8725 23.0045C33.8725 17.0025 29.0069 12.137 23.005 12.137C17.003 12.137 12.1375 17.0025 12.1375 23.0045Z"
        fill="white"
      />
      <defs>
        <linearGradient
          id="deck_wink_paint0_linear_225_3407"
          x1="29.4556"
          y1="0"
          x2="29.4556"
          y2="36.5798"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9F65FD" />
          <stop offset="1" stopColor="#7E3BEB" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** `vuesax/outline/profile-add` — the glyph inside the follow badge, node 844:23447. White, on a disc the card draws. */
export function IconPalAdd({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 71 71"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M54.7295 59.9047H42.8962C41.6833 59.9047 40.6774 58.8989 40.6774 57.686C40.6774 56.473 41.6833 55.4672 42.8962 55.4672H54.7295C55.9424 55.4672 56.9482 56.473 56.9482 57.686C56.9482 58.8989 55.9424 59.9047 54.7295 59.9047Z"
        fill="white"
      />
      <path
        d="M48.8127 65.8215C47.5998 65.8215 46.5939 64.8157 46.5939 63.6028V51.7695C46.5939 50.5565 47.5998 49.5507 48.8127 49.5507C50.0256 49.5507 51.0314 50.5565 51.0314 51.7695V63.6028C51.0314 64.8157 50.0256 65.8215 48.8127 65.8215Z"
        fill="white"
      />
      <path
        d="M35.9737 34.3757C35.8849 34.3757 35.8258 34.3757 35.737 34.3757C35.5891 34.3461 35.382 34.3461 35.2045 34.3757C26.6253 34.1094 20.1466 27.3645 20.1466 19.0515C20.117 14.9691 21.7145 11.1232 24.6137 8.22406C27.5128 5.3249 31.3587 3.69781 35.4708 3.69781C43.9316 3.69781 50.8245 10.5907 50.8245 19.0515C50.8245 27.3645 44.3457 34.0799 36.0624 34.3757C36.0328 34.3757 36.0033 34.3757 35.9737 34.3757ZM35.4708 8.13531C32.542 8.13531 29.8203 9.28906 27.7495 11.3303C25.7083 13.4011 24.5841 16.1228 24.5841 19.022C24.5841 24.9386 29.1991 29.7311 35.0862 29.9086C35.2637 29.879 35.6483 29.879 36.0328 29.9086C41.8608 29.6424 46.387 24.8795 46.387 19.022C46.387 13.0461 41.4762 8.13531 35.4708 8.13531Z"
        fill="white"
      />
      <path
        d="M35.4707 66.7415C29.4357 66.7415 23.7262 65.1735 19.407 62.2744C15.2949 59.5231 13.0466 55.7661 13.0466 51.7131C13.0466 47.6602 15.3245 43.9327 19.407 41.2111C28.2524 35.2944 42.6299 35.2944 51.4753 41.2111C52.4811 41.8915 52.777 43.2819 52.0966 44.2877C51.4161 45.3232 50.0257 45.5894 49.0199 44.909C41.6536 39.9982 29.2287 39.9982 21.8624 44.909C19.0224 46.8023 17.4841 49.1986 17.4841 51.7131C17.4841 54.2277 19.0224 56.6831 21.8624 58.5765C25.442 60.9727 30.2641 62.2744 35.4412 62.2744C36.6541 62.2744 37.6599 63.2802 37.6599 64.4931C37.6599 65.706 36.6837 66.7415 35.4707 66.7415Z"
        fill="white"
      />
    </svg>
  );
}

/**
 * THE CROWN — node 1331:21359 (`Group 1000002790`), the badge beside the front
 * card's name on `/pals` (1328:1885). Exported as ONE SVG and kept whole: a
 * `#2E1359` plate under a `#472185` plate, a `#7E3BEB` tile ringed `#AE7BFF`
 * with two 8% sunburst washes over it, the crown itself on the file's
 * `#F0DEFF -> #BC93FF -> #DDC8FF` ramp with its 0.61 drop shadow, and three
 * `#D9D9D9` sparks. 16.27 x 16.57 in the file, drawn here in a 17 box at the
 * export's own coordinates and scaled by the card.
 *
 * Like the org lockups (`org-badge-glyphs.tsx`) this is artwork with its own
 * fills, not a line icon, so nothing is recoloured to `currentColor`.
 *
 * NOTHING SETS IT YET. The profile carries no premium / verified-tier field
 * the crown could stand for, so `PalCard` draws it only behind a `premium`
 * prop that no surface passes — see the note there. The artwork is here so the
 * day the field lands it is one prop, not a re-export.
 */
export function IconPalCrown({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 17 17"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0 5.30375C0 2.89236 1.95482 0.937544 4.36621 0.937544H12.3192C14.7306 0.937544 16.6854 2.89236 16.6854 5.30375V12.633C16.6854 15.0444 14.7306 16.9992 12.3192 16.9992H4.36621C1.95482 16.9992 0 15.0444 0 12.633V5.30375Z"
        fill="#2E1359"
      />
      <g clipPath="url(#clip0_1331_21359)">
        <path
          d="M0 4.36621C0 1.95482 1.95482 0 4.36621 0H12.3192C14.7306 0 16.6854 1.95482 16.6854 4.36621V11.6955C16.6854 14.1069 14.7306 16.0617 12.3192 16.0617H4.36621C1.95482 16.0617 0 14.1069 0 11.6955V4.36621Z"
          fill="#472185"
        />
        <rect
          x="24.006"
          y="7.37214"
          width="11.4472"
          height="27.63"
          transform="rotate(128.831 24.006 7.37214)"
          fill="url(#paint0_linear_1331_21359)"
        />
      </g>
      <g clipPath="url(#clip1_1331_21359)">
        <path
          d="M1.55907 5.92477C1.55907 3.51338 3.51388 1.55857 5.92527 1.55857H10.7595C13.1709 1.55857 15.1257 3.51338 15.1257 5.92477V10.1353C15.1257 12.5467 13.1709 14.5015 10.7595 14.5015H5.92527C3.51389 14.5015 1.55907 12.5467 1.55907 10.1353V5.92477Z"
          fill="#7E3BEB"
        />
        <g opacity="0.08">
          <path
            d="M15.6767 4.83026L8.36289 8.08086L16.7762 6.4237L15.6767 4.83026Z"
            fill="url(#paint1_linear_1331_21359)"
          />
          <path
            d="M16.3381 8.93335L8.37883 8.09153L16.4936 10.863L16.3381 8.93335Z"
            fill="url(#paint2_linear_1331_21359)"
          />
          <path
            d="M14.8509 12.7895L8.37884 8.08086L14.0206 14.5384L14.8509 12.7895Z"
            fill="url(#paint3_linear_1331_21359)"
          />
          <path
            d="M11.6348 15.3855L8.38418 8.07164L10.0413 16.4849L11.6348 15.3855Z"
            fill="url(#paint4_linear_1331_21359)"
          />
          <path
            d="M7.55158 16.0256L8.3934 8.06633L5.6219 16.1811L7.55158 16.0256Z"
            fill="url(#paint5_linear_1331_21359)"
          />
          <path
            d="M3.69539 14.5383L8.40407 8.0663L1.94651 13.7081L3.69539 14.5383Z"
            fill="url(#paint6_linear_1331_21359)"
          />
          <path
            d="M1.09947 11.3222L8.41331 8.07162L0 9.72879L1.09947 11.3222Z"
            fill="url(#paint7_linear_1331_21359)"
          />
          <path
            d="M0.459359 7.23907L8.41863 8.08089L0.303908 5.30938L0.459359 7.23907Z"
            fill="url(#paint8_linear_1331_21359)"
          />
          <path
            d="M1.9466 3.38289L8.41862 8.09157L2.77682 1.63401L1.9466 3.38289Z"
            fill="url(#paint9_linear_1331_21359)"
          />
          <path
            d="M5.16268 0.786952L8.41328 8.1008L6.75611 -0.312515L5.16268 0.786952Z"
            fill="url(#paint10_linear_1331_21359)"
          />
          <path
            d="M9.24588 0.146829L8.40405 8.1061L11.1756 -0.00862214L9.24588 0.146829Z"
            fill="url(#paint11_linear_1331_21359)"
          />
          <path
            d="M13.1021 1.63411L8.39339 8.10613L14.8509 2.46433L13.1021 1.63411Z"
            fill="url(#paint12_linear_1331_21359)"
          />
        </g>
        <g opacity="0.08">
          <path
            d="M15.6767 4.83026L8.36289 8.08086L16.7762 6.4237L15.6767 4.83026Z"
            fill="url(#paint13_linear_1331_21359)"
          />
          <path
            d="M16.3381 8.93335L8.37883 8.09153L16.4936 10.863L16.3381 8.93335Z"
            fill="url(#paint14_linear_1331_21359)"
          />
          <path
            d="M14.8509 12.7895L8.37884 8.08086L14.0206 14.5384L14.8509 12.7895Z"
            fill="url(#paint15_linear_1331_21359)"
          />
          <path
            d="M11.6348 15.3855L8.38418 8.07164L10.0413 16.4849L11.6348 15.3855Z"
            fill="url(#paint16_linear_1331_21359)"
          />
          <path
            d="M7.55158 16.0256L8.3934 8.06633L5.6219 16.1811L7.55158 16.0256Z"
            fill="url(#paint17_linear_1331_21359)"
          />
          <path
            d="M3.69539 14.5383L8.40407 8.0663L1.94651 13.7081L3.69539 14.5383Z"
            fill="url(#paint18_linear_1331_21359)"
          />
          <path
            d="M1.09947 11.3222L8.41331 8.07162L0 9.72879L1.09947 11.3222Z"
            fill="url(#paint19_linear_1331_21359)"
          />
          <path
            d="M0.459359 7.23907L8.41863 8.08089L0.303908 5.30938L0.459359 7.23907Z"
            fill="url(#paint20_linear_1331_21359)"
          />
          <path
            d="M1.9466 3.38289L8.41862 8.09157L2.77682 1.63401L1.9466 3.38289Z"
            fill="url(#paint21_linear_1331_21359)"
          />
          <path
            d="M5.16268 0.786952L8.41328 8.1008L6.75611 -0.312515L5.16268 0.786952Z"
            fill="url(#paint22_linear_1331_21359)"
          />
          <path
            d="M9.24588 0.146829L8.40405 8.1061L11.1756 -0.00862214L9.24588 0.146829Z"
            fill="url(#paint23_linear_1331_21359)"
          />
          <path
            d="M13.1021 1.63411L8.39339 8.10613L14.8509 2.46433L13.1021 1.63411Z"
            fill="url(#paint24_linear_1331_21359)"
          />
        </g>
        <g clipPath="url(#clip2_1331_21359)">
          <g filter="url(#filter0_d_1331_21359)">
            <path
              d="M12.3679 6.79607C12.3683 6.79607 12.3686 6.79636 12.3686 6.79672C12.3686 6.79984 12.3685 6.80275 12.367 6.80583C12.3664 6.80689 12.366 6.80797 12.3657 6.80911L11.5648 10.4771C11.5401 10.6063 11.4712 10.7229 11.3698 10.8067C11.2684 10.8906 11.141 10.9364 11.0094 10.9364H5.83113C5.69963 10.9363 5.57227 10.8904 5.47097 10.8066C5.36966 10.7228 5.30075 10.6063 5.2761 10.4771L4.47729 6.81872C4.47564 6.81118 4.47372 6.80366 4.47234 6.79607C4.45041 6.67457 4.46886 6.54924 4.52487 6.43921C4.58089 6.32919 4.67138 6.24052 4.78253 6.18677C4.89367 6.13302 5.01936 6.11714 5.14039 6.14155C5.26141 6.16596 5.37112 6.22932 5.45274 6.32195L6.14484 7.0679C6.3805 7.3219 6.79905 7.25252 6.94015 6.93606L7.90649 4.76883C7.9069 4.76791 7.90714 4.76692 7.90715 4.76591C7.90716 4.76459 7.9074 4.76327 7.90795 4.76208C7.95323 4.66478 8.02529 4.58236 8.1157 4.52449C8.20668 4.46625 8.31243 4.43531 8.42045 4.43531C8.52847 4.43531 8.63423 4.46625 8.7252 4.52449C8.81562 4.58236 8.88767 4.66478 8.93295 4.76208C8.93351 4.76327 8.93374 4.76459 8.93375 4.76591C8.93376 4.76692 8.934 4.76791 8.93442 4.76883L9.90075 6.93606C10.0419 7.25252 10.4604 7.3219 10.6961 7.0679L11.3882 6.32195C11.47 6.23 11.5795 6.16726 11.7002 6.14325C11.8209 6.11924 11.9461 6.13527 12.0569 6.18891C12.1676 6.24255 12.2579 6.33087 12.3139 6.44045C12.3697 6.5498 12.3885 6.67437 12.3673 6.79532C12.3672 6.79571 12.3675 6.79607 12.3679 6.79607Z"
              fill="url(#paint25_linear_1331_21359)"
            />
          </g>
        </g>
        <rect
          x="19.2096"
          y="6.87933"
          width="9.05994"
          height="18.1357"
          transform="rotate(128.831 19.2096 6.87933)"
          fill="url(#paint26_linear_1331_21359)"
        />
        <path
          d="M13.5664 7.33208L13.777 7.90128L14.3462 8.1119L13.777 8.32253L13.5664 8.89173L13.3558 8.32253L12.7866 8.1119L13.3558 7.90128L13.5664 7.33208Z"
          fill="#D9D9D9"
        />
        <path
          d="M5.45803 2.80863L5.66866 3.37783L6.23786 3.58845L5.66866 3.79908L5.45803 4.36828L5.24741 3.79908L4.67821 3.58845L5.24741 3.37783L5.45803 2.80863Z"
          fill="#D9D9D9"
        />
        <path
          d="M3.89846 10.1367L4.10909 10.7059L4.67829 10.9165L4.10909 11.1271L3.89846 11.6964L3.68784 11.1271L3.11864 10.9165L3.68784 10.7059L3.89846 10.1367Z"
          fill="#D9D9D9"
        />
      </g>
      <path
        d="M5.92526 1.6367H10.7592C13.1275 1.6367 15.0473 3.55644 15.0473 5.92476V10.1357C15.0471 12.5038 13.1274 14.4238 10.7592 14.4238H5.92526C3.55708 14.4237 1.63743 12.5038 1.6372 10.1357V5.92476C1.6372 3.55644 3.55694 1.6367 5.92526 1.6367Z"
        stroke="#AE7BFF"
        strokeWidth="0.15203"
      />
      <defs>
        <filter
          id="filter0_d_1331_21359"
          x="3.83961"
          y="4.43531"
          width="9.16002"
          height="7.90613"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="0.760152" />
          <feGaussianBlur stdDeviation="0.304061" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1331_21359" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_1331_21359"
            result="shape"
          />
        </filter>
        <linearGradient
          id="paint0_linear_1331_21359"
          x1="24.006"
          y1="21.1872"
          x2="35.4532"
          y2="21.1872"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E4D3FF" stopOpacity="0.31" />
          <stop offset="1" stopColor="#EFE6FE" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="paint1_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint2_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint3_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint4_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint5_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint6_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint7_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint8_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint9_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint10_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint11_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint12_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint13_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint14_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint15_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint16_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint17_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint18_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint19_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint20_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint21_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint22_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint23_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint24_linear_1331_21359"
          x1="13.6946"
          y1="1.99122"
          x2="8.13177"
          y2="8.38601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#FFF9F9" />
        </linearGradient>
        <linearGradient
          id="paint25_linear_1331_21359"
          x1="8.41957"
          y1="4.43531"
          x2="8.41957"
          y2="10.9364"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.0144231" stopColor="#F0DEFF" />
          <stop offset="0.432692" stopColor="#BC93FF" />
          <stop offset="1" stopColor="#DDC8FF" />
        </linearGradient>
        <linearGradient
          id="paint26_linear_1331_21359"
          x1="19.2096"
          y1="15.9472"
          x2="28.2696"
          y2="15.9472"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E4D3FF" stopOpacity="0.31" />
          <stop offset="1" stopColor="#EFE6FE" stopOpacity="0" />
        </linearGradient>
        <clipPath id="clip0_1331_21359">
          <path
            d="M0 4.36621C0 1.95482 1.95482 0 4.36621 0H12.3192C14.7306 0 16.6854 1.95482 16.6854 4.36621V11.6955C16.6854 14.1069 14.7306 16.0617 12.3192 16.0617H4.36621C1.95482 16.0617 0 14.1069 0 11.6955V4.36621Z"
            fill="white"
          />
        </clipPath>
        <clipPath id="clip1_1331_21359">
          <path
            d="M1.55907 5.92477C1.55907 3.51338 3.51388 1.55857 5.92527 1.55857H10.7595C13.1709 1.55857 15.1257 3.51338 15.1257 5.92477V10.1353C15.1257 12.5467 13.1709 14.5015 10.7595 14.5015H5.92527C3.51389 14.5015 1.55907 12.5467 1.55907 10.1353V5.92477Z"
            fill="white"
          />
        </clipPath>
        <clipPath id="clip2_1331_21359">
          <rect
            width="8.81791"
            height="8.81791"
            fill="white"
            transform="translate(3.89842 3.58591) scale(1.02569)"
          />
        </clipPath>
      </defs>
    </svg>
  );
}

/** `arrow-left-01-round` — the deck's step control, node 844:22644 (identical to 844:22641 mirrored). Stroked, so it takes `currentColor`; flip it with a transform for `next`. */
export function IconDeckArrow({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15 6C15 6 9.00001 10.4189 9 12C8.99999 13.5812 15 18 15 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** PASS — the cross, node 844:23444: a 64.75 frame around the 42.5 `#7E3BEB` vector. The 23% disc under it is the card's. */
export function IconPalPass({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 65 65"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M52.9337 48.6284C53.5061 49.2008 53.8277 49.9771 53.8277 50.7866C53.8277 51.5961 53.5061 52.3724 52.9337 52.9448C52.3613 53.5171 51.585 53.8387 50.7755 53.8387C49.9661 53.8387 49.1897 53.5171 48.6173 52.9448L32.497 36.8193L16.3716 52.9397C15.7992 53.5121 15.0229 53.8336 14.2134 53.8336C13.4039 53.8336 12.6276 53.5121 12.0552 52.9397C11.4828 52.3673 11.1613 51.591 11.1613 50.7815C11.1613 49.972 11.4828 49.1957 12.0552 48.6233L28.1806 32.503L12.0603 16.3776C11.4879 15.8052 11.1664 15.0288 11.1664 14.2194C11.1664 13.4099 11.4879 12.6336 12.0603 12.0612C12.6327 11.4888 13.409 11.1672 14.2185 11.1672C15.028 11.1672 15.8043 11.4888 16.3767 12.0612L32.497 28.1866L48.6224 12.0587C49.1948 11.4863 49.9711 11.1647 50.7806 11.1647C51.5901 11.1647 52.3664 11.4863 52.9388 12.0587C53.5112 12.631 53.8327 13.4074 53.8327 14.2168C53.8327 15.0263 53.5112 15.8026 52.9388 16.375L36.8134 32.503L52.9337 48.6284Z"
        fill="#7E3BEB"
      />
    </svg>
  );
}

/** WINK — `Component 14`, node 844:23442: the white line-art face, 72.84, on a disc the card draws in the create → spotlight ramp. */
export function IconPalWink({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 73 73"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M27.1425 26.8904C26.8979 24.0877 24.427 22.0142 21.6243 22.26C18.8233 22.5056 16.7513 24.9748 16.9958 27.7759C17.2402 30.577 19.7086 32.65 22.5098 32.4067C25.3127 32.1632 27.3871 29.6931 27.1425 26.8904ZM21.9693 25.6424C22.898 25.5872 23.6974 26.2913 23.76 27.2195C23.8226 28.1478 23.125 28.9528 22.1973 29.0228C21.259 29.0935 20.4429 28.3862 20.3796 27.4475C20.3163 26.5087 21.0301 25.6982 21.9693 25.6424Z"
        fill="white"
      />
      <path
        d="M54.1351 22.0679C54.8772 22.0751 55.4499 22.3616 55.8103 23.0363C56.0369 23.4579 56.0841 23.9531 55.9403 24.4098C55.836 24.7348 55.6405 25.0231 55.3776 25.2409C55.0255 25.5362 54.107 25.9529 53.6562 26.1768C52.7719 26.6145 51.89 27.0573 51.0105 27.5052C51.0686 27.5327 51.1261 27.5607 51.1836 27.5891L53.6462 28.8203C54.4852 29.2398 55.6263 29.6132 55.9322 30.5732C56.0771 31.0292 56.0369 31.5239 55.8205 31.9507C55.6057 32.3782 55.2282 32.7016 54.7729 32.8485C53.9373 33.1157 53.3398 32.7355 52.6188 32.3657L48.2296 30.1744C47.4433 29.7822 46.4843 29.3617 45.7761 28.8663C45.04 28.3515 44.9547 27.0199 45.5513 26.3621C46.0102 25.8558 46.8703 25.5079 47.5042 25.1928L49.8397 24.0271L52.1145 22.8871C52.7193 22.5843 53.468 22.1303 54.1351 22.0679Z"
        fill="white"
      />
      <path
        d="M20.9304 40.0665C21.1695 40.0539 21.464 40.0999 21.6865 40.1822C22.8302 40.6047 22.9309 41.5528 23.2552 42.5589C23.4106 43.0337 23.5948 43.4989 23.8066 43.9515C25.3903 47.3529 28.2729 49.9765 31.8081 51.2339C35.306 52.4715 39.1514 52.2759 42.5058 50.6893C45.442 49.2924 47.803 46.9207 49.1866 43.9781C49.5802 43.1204 49.8028 42.3766 50.0824 41.4842C50.251 40.9456 50.6289 40.4854 51.1528 40.2468C51.6503 40.0219 52.2175 40.0059 52.7267 40.2035C53.2159 40.3938 53.6091 40.7713 53.8191 41.2526C53.9347 41.5148 53.991 41.7994 53.9844 42.086C53.967 42.7721 53.3619 44.3217 53.1019 44.9965C52.4711 46.4915 51.6453 47.8964 50.6459 49.1747C47.6837 52.9347 43.3472 55.3614 38.5932 55.9193C33.8792 56.4684 29.1388 55.1365 25.4006 52.2126C22.7981 50.1765 20.8095 47.4599 19.6548 44.3637C19.4501 43.8299 19.0782 42.7845 19.0239 42.2316C18.9045 41.0146 19.8165 40.1775 20.9304 40.0665Z"
        fill="white"
      />
      <path
        d="M72.9987 36.4994C72.9987 56.6574 56.6574 72.9987 36.4994 72.9987C16.3413 72.9987 0 56.6574 0 36.4994C0 16.3413 16.3413 0 36.4994 0C56.6574 0 72.9987 16.3413 72.9987 36.4994ZM3.93185 36.4994C3.93185 54.4859 18.5128 69.0669 36.4994 69.0669C54.4859 69.0669 69.0669 54.4859 69.0669 36.4994C69.0669 18.5128 54.4859 3.93185 36.4994 3.93185C18.5128 3.93185 3.93185 18.5128 3.93185 36.4994Z"
        fill="white"
      />
    </svg>
  );
}

/**
 * WINK, EYES OPEN — `Component 14`'s other variant, node 206:6942
 * (`Property 1=Frame 2147230458`). `IconPalWink` above is 206:6943, the
 * winking frame every card instance rests on; the two carry `AFTER_TIMEOUT`
 * interactions at each other (0.8s, a 0.3s linear smart-animate), so the face
 * BLINKS. The card stacks this over the winking one and cross-fades on that
 * clock (`ws-wink-blink`). Exported as its own node: the second eye is a ring
 * here, and the file draws this frame's outer ring `#D9D9D9` rather than white.
 */
export function IconPalWinkOpen({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 215 215"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M79.9423 79.196C79.2219 70.9412 71.9444 64.8345 63.6898 65.5582C55.4401 66.2816 49.3377 73.554 50.0577 81.804C50.7776 90.054 58.0475 96.1594 66.2979 95.4429C74.553 94.7258 80.6627 87.4508 79.9423 79.196ZM64.7059 75.5203C67.4412 75.3577 69.7958 77.4314 69.9801 80.1653C70.1645 82.8993 68.1096 85.2702 65.3773 85.4764C62.614 85.6848 60.2102 83.6016 60.0238 80.8367C59.8373 78.0719 61.9396 75.6848 64.7059 75.5203Z"
        fill="white"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M158.942 79.696C158.222 71.4412 150.944 65.3345 142.69 66.0582C134.44 66.7816 128.338 74.054 129.058 82.304C129.778 90.554 137.048 96.6594 145.298 95.9429C153.553 95.2258 159.663 87.9508 158.942 79.696ZM143.706 76.0203C146.441 75.8577 148.796 77.9314 148.98 80.6653C149.164 83.3993 147.11 85.7702 144.377 85.9764C141.614 86.1848 139.21 84.1016 139.024 81.3367C138.837 78.5719 140.94 76.1848 143.706 76.0203Z"
        fill="white"
      />
      <path
        d="M61.646 118.006C62.3503 117.969 63.2177 118.104 63.8729 118.347C67.2414 119.591 67.538 122.384 68.4933 125.347C68.951 126.745 69.4933 128.115 70.1174 129.448C74.7817 139.466 83.2717 147.194 93.6836 150.897C103.986 154.542 115.311 153.966 125.191 149.293C133.839 145.179 140.793 138.193 144.868 129.527C146.027 127 146.683 124.81 147.506 122.181C148.003 120.595 149.116 119.24 150.659 118.537C152.124 117.875 153.795 117.827 155.294 118.41C156.735 118.97 157.893 120.082 158.512 121.499C158.852 122.272 159.018 123.11 158.998 123.954C158.947 125.975 157.165 130.539 156.399 132.526C154.542 136.929 152.109 141.067 149.166 144.832C140.441 155.906 127.669 163.053 113.667 164.696C99.7837 166.314 85.822 162.391 74.812 153.779C67.1469 147.782 61.2899 139.781 57.889 130.662C57.2862 129.09 56.1909 126.011 56.0311 124.383C55.6792 120.798 58.3654 118.333 61.646 118.006Z"
        fill="white"
      />
      <path
        d="M215 107.5C215 166.871 166.871 215 107.5 215C48.1294 215 0 166.871 0 107.5C0 48.1294 48.1294 0 107.5 0C166.871 0 215 48.1294 215 107.5ZM11.5803 107.5C11.5803 160.475 54.525 203.42 107.5 203.42C160.475 203.42 203.42 160.475 203.42 107.5C203.42 54.525 160.475 11.5803 107.5 11.5803C54.525 11.5803 11.5803 54.525 11.5803 107.5Z"
        fill="#D9D9D9"
      />
    </svg>
  );
}
