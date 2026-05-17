export type TabMode = 'sea' | 'truck' | 'air' | 'customs' | 'sourcing' | 'remit';
export type SeaMode = 'lcl' | 'fcl';
export type Term = 'ddp' | 'exw' | 'fob';
export type LclDoc = 'invoice' | 'customs' | 'none';
export type FclSize = '20ft' | '40ft';
export type TruckSub = 'share' | 'full';

export interface SalesCard {
  name: string;
  slogan: string;
  phone: string;
  image: string;
  alt: string;
  link: string;
  button: string;
}

export interface DropdownChip {
  value: string;
  label: string;
}

export interface DropdownSection {
  heading: string;
  chips: DropdownChip[];
}

export interface CalcRow {
  label: string;
  value: string;
}

export interface CalcResult {
  amount: number;
  currency: string;
  label: string;
  rows: CalcRow[];
  note: string;
}

/**
 * The slice of a calculated booking quote carried from the public
 * `BookingCalculator` into the protected order flow (G-F-2). Built per-mode
 * in `BookingCalculator` and passed to `ResultBox` → `QuoteCTA` → the
 * `/start-order` query string → the order-form pre-fill.
 */
export interface QuoteCarry {
  mode: TabMode;
  /** Calculated total (THB). 0 when the calc returned no priceable result. */
  price: number;
  weightKg?: number;
  volumeCbm?: number;
  /** sea modes only — incoterm. */
  term?: Term;
  /** FCL only — container size. */
  size?: FclSize;
  /** truck only — share-truck vs full-truck. */
  sub?: TruckSub;
  /** the service-import transport_type the mode resolves to. */
  transport?: "ship" | "truck" | "air";
}

export interface LCLForm {
  origin: string;
  originLabel: string;
  productType: string;
  productLabel: string;
  weight: string;
  cbm: string;
  cif: string;
  dateStart: string;
  dateEnd: string;
}

export interface FCLForm {
  origin: string;
  originLabel: string;
  productType: string;
  productLabel: string;
  cbm: string;
  weight: string;
  cif: string;
  date: string;
}

export interface TruckForm {
  origin: string;
  originLabel: string;
  dest: string;
  destLabel: string;
  productType: string;
  productLabel: string;
  weight: string;
  cbm: string;
  date: string;
}

export interface AirForm {
  origin: string;
  dest: string;
  weight: string;
  w: string;
  l: string;
  h: string;
}

export interface CustomsForm {
  port: string;
  portLabel: string;
  country: string;
  countryLabel: string;
  productType: string;
  productLabel: string;
  awb: string;
  contact: string;
}

export interface SourcingForm {
  platform: string;
  platformLabel: string;
  url: string;
  qty: string;
  budget: string;
}

export interface RemitForm {
  currency: string;
  currencyLabel: string;
  amount: string;
  country: string;
  purpose: string;
}
