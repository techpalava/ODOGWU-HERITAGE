import type { FutureShippingDestinationZone } from "../types";

export const STEP8_DELIVERY_RATE_VERSION = "step8-delivery-v1" as const;

export const STEP8_SUPPORTED_RATE_VERSIONS = Object.freeze([
  STEP8_DELIVERY_RATE_VERSION,
] as const);

/** ISO countries that require a state / province / region for courier delivery. */
export const STEP8_REGION_REQUIRED_COUNTRY_CODES = Object.freeze(
  new Set(["US", "CA"]),
);

export const STEP8_KG_PER_PHYSICAL_GARMENT = 0.5;

export type Step8WeightTier = "0_2" | "2_5" | "5_10" | "10_20" | "over_20";

export type Step8DestinationZone = FutureShippingDestinationZone;

export const STEP8_DESTINATION_ZONES = Object.freeze([
  "EINDHOVEN",
  "NETHERLANDS_OTHER",
  "EUROPE",
  "NORTH_AMERICA",
  "SOUTH_AMERICA",
  "AFRICA",
  "ASIA",
] as const satisfies readonly Step8DestinationZone[]);

export const STEP8_WEIGHT_TIER_LABELS: Readonly<Record<Step8WeightTier, string>> =
  Object.freeze({
    "0_2": "0–2 kg",
    "2_5": ">2–5 kg",
    "5_10": ">5–10 kg",
    "10_20": ">10–20 kg",
    over_20: ">20 kg",
  });

export const STEP8_DESTINATION_ZONE_LABELS: Readonly<
  Record<Step8DestinationZone, string>
> = Object.freeze({
  EINDHOVEN: "Eindhoven",
  NETHERLANDS_OTHER: "Netherlands",
  EUROPE: "Europe",
  NORTH_AMERICA: "North America",
  SOUTH_AMERICA: "South America",
  AFRICA: "Africa",
  ASIA: "Asia",
});

const toCountryCodeSet = (codes: string): ReadonlySet<string> =>
  Object.freeze(new Set(codes.trim().split(/\s+/)));

/** NL is resolved separately so Eindhoven can stay distinct from the rest of the Netherlands. */
export const STEP8_EUROPE_COUNTRY_CODES = toCountryCodeSet(`
  AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT
  LV LI LT LU MT MD MC ME MK NO PL PT RO RU SM RS SK SI ES SE
  CH TR UA GB VA XK AX FO GI GG IM JE SJ
`);

export const STEP8_NORTH_AMERICA_COUNTRY_CODES = toCountryCodeSet("CA MX US PM");

export const STEP8_SOUTH_AMERICA_COUNTRY_CODES = toCountryCodeSet(`
  AR BO BR CL CO EC GF GY PY PE SR UY VE FK
`);

export const STEP8_AFRICA_COUNTRY_CODES = toCountryCodeSet(`
  DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET
  GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW
  ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH
`);

export const STEP8_ASIA_COUNTRY_CODES = toCountryCodeSet(`
  AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW
  KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY
  TW TJ TH TL TM AE UZ VN YE
`);

/** Valid ISO countries without an approved Step 8 zone. Fail closed to a custom quote. */
export const STEP8_QUOTE_REQUIRED_COUNTRY_CODES = toCountryCodeSet(`
  AG AI AS AU AW BB BM BQ BS BZ CC CK CR CU CW CX DM DO FJ FM
  GD GL GP GT GU HN HT JM KI KN KY LC MH MP MQ MS NC NF NI NR
  NU NZ PA PF PG PN PR PW RE SB SH SX TC TK TO TT TV UM VC VG
  VI VU WF WS YT AQ BV GS HM IO TF
`);

const ZONE_CODE_GROUPS: ReadonlyArray<
  readonly [Step8DestinationZone, ReadonlySet<string>]
> = Object.freeze([
  ["EUROPE", STEP8_EUROPE_COUNTRY_CODES],
  ["NORTH_AMERICA", STEP8_NORTH_AMERICA_COUNTRY_CODES],
  ["SOUTH_AMERICA", STEP8_SOUTH_AMERICA_COUNTRY_CODES],
  ["AFRICA", STEP8_AFRICA_COUNTRY_CODES],
  ["ASIA", STEP8_ASIA_COUNTRY_CODES],
]);

const buildCountryZoneIndex = (): ReadonlyMap<
  string,
  Step8DestinationZone | "quote_required"
> => {
  const index = new Map<string, Step8DestinationZone | "quote_required">();
  index.set("NL", "NETHERLANDS_OTHER");
  for (const [zone, codes] of ZONE_CODE_GROUPS) {
    for (const code of codes) {
      index.set(code, zone);
    }
  }
  for (const code of STEP8_QUOTE_REQUIRED_COUNTRY_CODES) {
    if (!index.has(code)) {
      index.set(code, "quote_required");
    }
  }
  return index;
};

export const STEP8_COUNTRY_ZONE_INDEX = buildCountryZoneIndex();

const countryDisplayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export interface Step8CountryOption {
  readonly code: string;
  readonly label: string;
}

export const STEP8_COUNTRY_OPTIONS: readonly Step8CountryOption[] = Object.freeze(
  [...STEP8_COUNTRY_ZONE_INDEX.keys()]
    .map((code) => ({
      code,
      label: countryDisplayNames?.of(code) || code,
    }))
    .sort((left, right) => left.label.localeCompare(right.label)),
);

type PricedWeightTier = Exclude<Step8WeightTier, "over_20">;

export const STEP8_ADDITIONAL_DELIVERY_RATES_CENTS: Readonly<
  Record<Step8DestinationZone, Readonly<Record<PricedWeightTier, number>>>
> = Object.freeze({
  EINDHOVEN: Object.freeze({
    "0_2": 750,
    "2_5": 975,
    "5_10": 1268,
    "10_20": 2028,
  }),
  NETHERLANDS_OTHER: Object.freeze({
    "0_2": 750,
    "2_5": 975,
    "5_10": 1268,
    "10_20": 2028,
  }),
  EUROPE: Object.freeze({
    "0_2": 1900,
    "2_5": 2660,
    "5_10": 3724,
    "10_20": 5214,
  }),
  NORTH_AMERICA: Object.freeze({
    "0_2": 3800,
    "2_5": 6080,
    "5_10": 9728,
    "10_20": 18483,
  }),
  SOUTH_AMERICA: Object.freeze({
    "0_2": 4875,
    "2_5": 7800,
    "5_10": 12480,
    "10_20": 23712,
  }),
  AFRICA: Object.freeze({
    "0_2": 4875,
    "2_5": 7800,
    "5_10": 12480,
    "10_20": 23712,
  }),
  ASIA: Object.freeze({
    "0_2": 4875,
    "2_5": 7800,
    "5_10": 12480,
    "10_20": 23712,
  }),
});

export const STEP8_HEADLINE_WEIGHT_TIER: PricedWeightTier = "2_5";

export const STEP8_HEADLINE_RATES_CENTS: Readonly<
  Record<Step8DestinationZone, number>
> = Object.freeze(
  Object.fromEntries(
    STEP8_DESTINATION_ZONES.map((zone) => [
      zone,
      STEP8_ADDITIONAL_DELIVERY_RATES_CENTS[zone][STEP8_HEADLINE_WEIGHT_TIER],
    ]),
  ) as Record<Step8DestinationZone, number>,
);

export const STEP8_PICKUP_FEE_CENTS = 0;

export const STEP8_RULE_IDS = Object.freeze({
  pickup: "step8_pickup_eindhoven",
  courier: "step8_additional_delivery",
  quoteRequired: "step8_quote_required",
});

export const isStep8DestinationZone = (
  value: string,
): value is Step8DestinationZone =>
  (STEP8_DESTINATION_ZONES as readonly string[]).includes(value);

export const isSupportedStep8RateVersion = (
  value: string | null | undefined,
): value is typeof STEP8_DELIVERY_RATE_VERSION =>
  Boolean(
    value &&
      (STEP8_SUPPORTED_RATE_VERSIONS as readonly string[]).includes(value),
  );

export const formatStep8CountryLabel = (countryCode: string): string =>
  countryDisplayNames?.of(countryCode) || countryCode;
