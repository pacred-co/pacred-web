import type { SalesCard, DropdownSection } from '@/types/booking';
import { LINE_OA } from '@/components/seo/site';

export const HERO_IMGS: Record<string, string> = {
  default:  '/images/hero-section/banner/default.png',
  lcl:      '/images/hero-section/banner/ship.png',
  fcl:      '/images/hero-section/banner/ship.png',
  truck:    '/images/hero-section/banner/car.png',
  air:      '/images/hero-section/banner/airbanner.png',
  customs:  '/images/hero-section/banner/customs.png',
  sourcing: '/images/hero-section/banner/shop.png',
  remit:    '/images/hero-section/banner/exchange.png',
};

// Keys map into the `bookingCalc.hero.*` namespace.
export const HERO_CONTENT_KEYS: Record<string, { titleKey: string; subKey: string }> = {
  default:  { titleKey: 'defaultTitle',  subKey: 'defaultSub' },
  lcl:      { titleKey: 'lclTitle',      subKey: 'lclSub' },
  fcl:      { titleKey: 'fclTitle',      subKey: 'fclSub' },
  truck:    { titleKey: 'truckTitle',    subKey: 'truckSub' },
  air:      { titleKey: 'airTitle',      subKey: 'airSub' },
  customs:  { titleKey: 'customsTitle',  subKey: 'customsSub' },
  sourcing: { titleKey: 'sourcingTitle', subKey: 'sourcingSub' },
  remit:    { titleKey: 'remitTitle',    subKey: 'remitSub' },
};

// SALES_CARDS: name/phone are literal data (proper nouns), the rest comes from i18n.
// `personKey` resolves under `salesTeam.{personKey}.{slogan|alt|button}`.
export interface SalesCardData extends Omit<SalesCard, 'slogan' | 'alt' | 'button'> {
  personKey: 'win' | 'nat' | 'ploy' | 'redar' | 'pee';
}

// All 5 reps currently route to the main Pacred OA. Swap to per-rep
// add-friend URLs (LINE OA Manager → "ตอบโดยอัตโนมัติ" or per-rep accounts)
// once each rep has their own LINE channel.
//
// Source-of-truth for rep contact info is `components/sections/contact-sales.tsx`;
// keep this list in sync when adding/editing a rep (image path + phone +
// personKey + same i18n key in `salesTeam.*`).
export const SALES_CARDS_DATA: SalesCardData[] = [
  { personKey: 'win',   name: 'วิน',    phone: '062-603-0456', image: '/images/Character_Icon/win01.png',   link: LINE_OA.shortUrl },
  { personKey: 'nat',   name: 'แนท',    phone: '02-421-3325',  image: '/images/pacred-logo-red.png',        link: LINE_OA.shortUrl },
  { personKey: 'ploy',  name: 'พลอย',   phone: '066-090-1217', image: '/images/Character_Icon/ploy01.png',  link: LINE_OA.shortUrl },
  { personKey: 'redar', name: 'เรดาห์', phone: '099-444-9978', image: '/images/Character_Icon/redar01.png', link: LINE_OA.shortUrl },
  { personKey: 'pee',   name: 'พี',     phone: '061-779-9299', image: '/images/Character_Icon/pee01.png',   link: LINE_OA.shortUrl },
];

// Sections describe shape — `headingKey` and `chips[].labelKey` are i18n paths into `bookingCalc.data.*`.
export interface DropdownSectionKeys {
  headingKey: string;
  chips: { value: string; labelKey: string }[];
}

export const ORIGIN_SECTIONS_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'originHeading',
    chips: [
      { value: 'guangzhou', labelKey: 'originGuangzhou' },
      { value: 'yiwu',      labelKey: 'originYiwu' },
    ],
  },
];

export const PRODUCT_SECTIONS_LCL_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'productHeading',
    chips: [
      { value: 'general',   labelKey: 'productLcl1' },
      { value: 'general',   labelKey: 'productLcl2' },
      { value: 'general',   labelKey: 'productLcl3' },
      { value: 'fda',       labelKey: 'productFda' },
      { value: 'tisi',      labelKey: 'productTisi' },
      { value: 'machinery', labelKey: 'productMachinery' },
      { value: 'special',   labelKey: 'productSpecial' },
    ],
  },
];

export const PRODUCT_SECTIONS_FCL_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'productHeading',
    chips: [
      { value: 'general',   labelKey: 'productFclGeneral' },
      { value: 'fda',       labelKey: 'productFda' },
      { value: 'tisi',      labelKey: 'productTisi' },
      { value: 'machinery', labelKey: 'productMachinery' },
      { value: 'special',   labelKey: 'productFclSpecial' },
    ],
  },
];

export const PRODUCT_SECTIONS_TRUCK_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'productHeading',
    chips: [
      { value: 'general',   labelKey: 'productTruckGeneral' },
      { value: 'machinery', labelKey: 'productTruckMachinery' },
      { value: 'special',   labelKey: 'productSpecial' },
    ],
  },
];

export const TRUCK_DEST_SECTIONS_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'truckDestHeading',
    chips: [
      { value: 'warehouse', labelKey: 'truckDestWarehouse' },
      { value: 'bangkok',   labelKey: 'truckDestBangkok' },
      { value: 'upcountry', labelKey: 'truckDestUpcountry' },
    ],
  },
];

export const AIR_ORIGIN_CHIP_KEYS = [
  'airOrigin1',
  'airOrigin2',
  'airOrigin3',
  'airOrigin4',
  'airOrigin5',
  'airOrigin6',
  'airOrigin7',
  'airUndecided',
];

export const AIR_DEST_CHIP_KEYS = [
  'airDest1',
  'airDest2',
  'airDest3',
  'airDest4',
  'airDest5',
  'airDest6',
  'airUndecided',
];

export const CUSTOMS_PORT_SECTIONS_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'customsPortAirport',
    chips: [
      { value: 'bkk_airport', labelKey: 'customsPortBkkAir' },
      { value: 'dmk_airport', labelKey: 'customsPortDmkAir' },
    ],
  },
  {
    headingKey: 'customsPortSeaport',
    chips: [
      { value: 'laem_chabang', labelKey: 'customsPortLaem' },
      { value: 'bangkok_port', labelKey: 'customsPortBkkPort' },
      { value: 'icd',          labelKey: 'customsPortIcd' },
    ],
  },
  {
    headingKey: 'customsPortBorder',
    chips: [
      { value: 'mukdahan',      labelKey: 'customsPortMukdahan' },
      { value: 'nakhonphanom',  labelKey: 'customsPortNakhon' },
      { value: 'aranyaprathet', labelKey: 'customsPortArany' },
      { value: 'maesai',        labelKey: 'customsPortMaesai' },
    ],
  },
];

export const CUSTOMS_COUNTRY_SECTIONS_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'customsCountryHeading',
    chips: [
      { value: 'china',  labelKey: 'customsCountryChina' },
      { value: 'japan',  labelKey: 'customsCountryJapan' },
      { value: 'usa',    labelKey: 'customsCountryUsa' },
      { value: 'europe', labelKey: 'customsCountryEurope' },
      { value: 'korea',  labelKey: 'customsCountryKorea' },
      { value: 'other',  labelKey: 'customsCountryOther' },
    ],
  },
];

export const CUSTOMS_PRODUCT_SECTIONS_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'productHeading',
    chips: [
      { value: 'general',   labelKey: 'productTruckGeneral' },
      { value: 'fda',       labelKey: 'productFda' },
      { value: 'tisi',      labelKey: 'productTisi' },
      { value: 'machinery', labelKey: 'productMachinery' },
      { value: 'special',   labelKey: 'productSpecial' },
    ],
  },
];

// Platform labels are proper nouns — keep literal.
export const PLATFORM_SECTIONS: DropdownSection[] = [
  {
    heading: '',
    chips: [
      { value: '1688',    label: '1688' },
      { value: 'taobao',  label: 'Taobao' },
      { value: 'tmall',   label: 'Tmall' },
      { value: 'alibaba', label: 'Alibaba' },
    ],
  },
];

export const CURRENCY_SECTIONS_KEYS: DropdownSectionKeys[] = [
  {
    headingKey: 'currencyHeading',
    chips: [
      { value: 'cny', labelKey: 'currencyCny' },
      { value: 'usd', labelKey: 'currencyUsd' },
      { value: 'eur', labelKey: 'currencyEur' },
      { value: 'jpy', labelKey: 'currencyJpy' },
    ],
  },
];

// Helper to translate a DropdownSectionKeys[] into a DropdownSection[] given a t() function
// scoped to the `bookingCalc.data` namespace.
export function resolveSections(
  sections: DropdownSectionKeys[],
  t: (k: string) => string,
): DropdownSection[] {
  return sections.map((s) => ({
    heading: t(s.headingKey),
    chips: s.chips.map((c) => ({ value: c.value, label: t(c.labelKey) })),
  }));
}

export function resolveChips(keys: string[], t: (k: string) => string): string[] {
  return keys.map((k) => t(k));
}
