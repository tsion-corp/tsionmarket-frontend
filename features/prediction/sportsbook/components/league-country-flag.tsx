import Flag from "react-world-flags";

const COUNTRY_CODES: Record<string, string> = {
  "european union": "EU",
  afghanistan: "AF",
  "aland islands": "AX",
  albania: "AL",
  algeria: "DZ",
  "american samoa": "AS",
  andorra: "AD",
  angola: "AO",
  anguilla: "AI",
  antarctica: "AQ",
  "antigua and barbuda": "AG",
  argentina: "AR",
  armenia: "AM",
  aruba: "AW",
  australia: "AU",
  austria: "AT",
  azerbaijan: "AZ",
  bahamas: "BS",
  bahrain: "BH",
  bangladesh: "BD",
  barbados: "BB",
  belarus: "BY",
  belgium: "BE",
  belize: "BZ",
  benin: "BJ",
  bermuda: "BM",
  bhutan: "BT",
  bolivia: "BO",
  "bosnia and herzegovina": "BA",
  botswana: "BW",
  "bouvet island": "BV",
  brazil: "BR",
  "british indian ocean territory": "IO",
  "brunei darussalam": "BN",
  bulgaria: "BG",
  "burkina-faso": "BF",
  burundi: "BI",
  cambodia: "KH",
  cameroon: "CM",
  canada: "CA",
  "cape verde": "CV",
  "cayman islands": "KY",
  "central african republic": "CF",
  chad: "TD",
  chile: "CL",
  china: "CN",
  "christmas island": "CX",
  "cocos (keeling) islands": "CC",
  colombia: "CO",
  comoros: "KM",
  congo: "CG",
  "congo, democratic republic": "CD",
  "cook islands": "CK",
  "costa rica": "CR",
  "cote d'ivoire": "CI",
  croatia: "HR",
  cuba: "CU",
  cyprus: "CY",
  "czech-republic": "CZ",
  denmark: "DK",
  djibouti: "DJ",
  dominica: "DM",
  "dominican-republic": "DO",
  ecuador: "EC",
  egypt: "EG",
  "el salvador": "SV",
  "equatorial guinea": "GQ",
  eritrea: "ER",
  estonia: "EE",
  ethiopia: "ET",
  "falkland islands (malvinas)": "FK",
  "faroe islands": "FO",
  fiji: "FJ",
  finland: "FI",
  france: "FR",
  "french guiana": "GF",
  "french polynesia": "PF",
  "french southern territories": "TF",
  gabon: "GA",
  gambia: "GM",
  georgia: "GE",
  germany: "DE",
  ghana: "GH",
  gibraltar: "GI",
  greece: "GR",
  greenland: "GL",
  grenada: "GD",
  guadeloupe: "GP",
  guam: "GU",
  guatemala: "GT",
  guernsey: "GG",
  guinea: "GN",
  "guinea-bissau": "GW",
  guyana: "GY",
  haiti: "HT",
  "heard island & mcdonald islands": "HM",
  "holy see (vatican city state)": "VA",
  honduras: "HN",
  "hong kong": "HK",
  hungary: "HU",
  iceland: "IS",
  india: "IN",
  indonesia: "ID",
  "iran, islamic republic of": "IR",
  iran: "IR",
  iraq: "IQ",
  ireland: "IE",
  "isle of man": "IM",
  israel: "IL",
  italy: "IT",
  jamaica: "JM",
  japan: "JP",
  jersey: "JE",
  jordan: "JO",
  kazakhstan: "KZ",
  kenya: "KE",
  kiribati: "KI",
  korea: "KR",
  "korea republic": "KR",
  "north korea": "KP",
  kuwait: "KW",
  kyrgyzstan: "KG",
  "lao people's democratic republic": "LA",
  latvia: "LV",
  lebanon: "LB",
  lesotho: "LS",
  liberia: "LR",
  "libyan arab jamahiriya": "LY",
  liechtenstein: "LI",
  lithuania: "LT",
  luxembourg: "LU",
  macao: "MO",
  macedonia: "MK",
  madagascar: "MG",
  malawi: "MW",
  malaysia: "MY",
  maldives: "MV",
  mali: "ML",
  malta: "MT",
  "marshall islands": "MH",
  martinique: "MQ",
  mauritania: "MR",
  mauritius: "MU",
  mayotte: "YT",
  mexico: "MX",
  "micronesia, federated states of": "FM",
  moldova: "MD",
  monaco: "MC",
  mongolia: "MN",
  montenegro: "ME",
  montserrat: "MS",
  morocco: "MA",
  mozambique: "MZ",
  myanmar: "MM",
  namibia: "NA",
  nauru: "NR",
  nepal: "NP",
  netherlands: "NL",
  "netherlands antilles": "AN",
  "new caledonia": "NC",
  "new-zealand": "NZ",
  nicaragua: "NI",
  niger: "NE",
  nigeria: "NG",
  niue: "NU",
  "norfolk island": "NF",
  "northern mariana islands": "MP",
  norway: "NO",
  oman: "OM",
  pakistan: "PK",
  palau: "PW",
  "palestinian territory, occupied": "PS",
  panama: "PA",
  "papua new guinea": "PG",
  paraguay: "PY",
  peru: "PE",
  philippines: "PH",
  pitcairn: "PN",
  poland: "PL",
  portugal: "PT",
  "puerto rico": "PR",
  qatar: "QA",
  reunion: "RE",
  romania: "RO",
  russia: "RU",
  "russian federation": "RU",
  rwanda: "RW",
  "saint barthelemy": "BL",
  "saint helena": "SH",
  "saint kitts and nevis": "KN",
  "saint lucia": "LC",
  "saint martin": "MF",
  "saint pierre and miquelon": "PM",
  "saint vincent and grenadines": "VC",
  samoa: "WS",
  "san marino": "SM",
  "sao tome and principe": "ST",
  "saudi-arabia": "SA",
  senegal: "SN",
  serbia: "RS",
  seychelles: "SC",
  "sierra leone": "SL",
  singapore: "SG",
  slovakia: "SK",
  slovenia: "SI",
  "solomon islands": "SB",
  somalia: "SO",
  "south-africa": "ZA",
  "south africa": "ZA",
  "south georgia and sandwich isl.": "GS",
  spain: "ES",
  "sri lanka": "LK",
  sudan: "SD",
  suriname: "SR",
  "svalbard and jan mayen": "SJ",
  swaziland: "SZ",
  sweden: "SE",
  switzerland: "CH",
  "syrian arab republic": "SY",
  taiwan: "TW",
  tajikistan: "TJ",
  tanzania: "TZ",
  thailand: "TH",
  "timor-leste": "TL",
  togo: "TG",
  tokelau: "TK",
  tonga: "TO",
  "trinidad and tobago": "TT",
  tunisia: "TN",
  turkey: "TR",
  turkmenistan: "TM",
  "turks and caicos islands": "TC",
  tuvalu: "TV",
  uganda: "UG",
  ukraine: "UA",
  "united arab emirates": "AE",
  "united-arab-emirates": "AE",
  "united-kingdom": "GB",
  "united kingdom": "GB",
  "united-states": "US",
  "united states": "US",
  "united states outlying islands": "UM",
  uruguay: "UY",
  uzbekistan: "UZ",
  vanuatu: "VU",
  venezuela: "VE",
  vietnam: "VN",
  "virgin islands, british": "VG",
  "virgin islands, u.s.": "VI",
  "wallis and futuna": "WF",
  "western sahara": "EH",
  yemen: "YE",
  zambia: "ZM",
  zimbabwe: "ZW",
  england: "GB_ENG",
  wales: "GB_WLS",
  scotland: "GB_SCT",
  "northern ireland": "GB_NIR",
};

const LEAGUE_COUNTRY_OVERRIDES: Record<string, string> = {
  nba: "united states",
  nhl: "united states",
  nfl: "united states",
  mlb: "united states",
  mls: "united states",
  "utr pro series boca raton": "united states",
  "usa-american-hockey-league": "united states",
  ncaa: "united states",
  "japan-top-league": "japan",
  "gallagher-premiership": "england",
  sa20: "south africa",
  "france-top-14": "france",
  "setka-cup": "ukraine",
  ahl: "united states",
  milb: "united states",
  ufl: "united states",
};

function NoFlag() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-full text-[#718096]">
      <path
        d="M5 21V4m0 1h11l-2 3 2 3H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function countryCode(countrySlug: string, countryName: string, leagueSlug: string): string | null {
  const override = LEAGUE_COUNTRY_OVERRIDES[leagueSlug.toLowerCase()];
  const values = [override, countrySlug, countryName].filter((value): value is string =>
    Boolean(value)
  );

  for (const value of values) {
    const normalized = value.toLowerCase();
    const code = COUNTRY_CODES[normalized] ?? COUNTRY_CODES[normalized.replaceAll("-", " ")];
    if (code) return code;
  }

  return null;
}

interface LeagueCountryFlagProps {
  countrySlug: string;
  countryName: string;
  leagueSlug: string;
  selected: boolean;
  compact?: boolean;
}

export function LeagueCountryFlag({
  countrySlug,
  countryName,
  leagueSlug,
  selected,
  compact = false,
}: LeagueCountryFlagProps) {
  const code = countryCode(countrySlug, countryName, leagueSlug);
  const mask = selected
    ? "[mask-image:linear-gradient(90deg,rgba(0,0,0,.5),transparent)]"
    : "[mask-image:linear-gradient(90deg,rgba(0,0,0,.4),transparent)]";

  return (
    <span
      aria-hidden="true"
      className={
        compact
          ? "relative block size-full overflow-hidden rounded-full"
          : `absolute bottom-0 left-0 h-full w-8 overflow-hidden rounded-l-lg ${mask} group-hover/league:[mask-image:linear-gradient(90deg,rgba(0,0,0,.5),transparent)]`
      }
    >
      {code ? (
        <Flag
          code={code}
          fallback={<NoFlag />}
          className="block size-full object-cover object-center"
        />
      ) : (
        <NoFlag />
      )}
    </span>
  );
}
