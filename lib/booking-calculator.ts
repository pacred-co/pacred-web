import type { CalcResult, LCLForm, FCLForm, TruckForm, AirForm, Term, FclSize, TruckSub } from '@/types/booking';

// Translation function — scoped to `bookingCalc.calc.*` keys.
// Used to localize labels/notes returned in `CalcResult`.
type Translator = (key: string, vars?: Record<string, string | number>) => string;

function fmt(n: number) {
  return n.toLocaleString('en-US');
}

const PRODUCT_SURCHARGE: Record<string, number> = {
  general:  0,
  fda:      3000,
  tisi:     4000,
  machinery:2000,
  special:  -1, // special = contact sales
};

const PRODUCT_SURCHARGE_FCL: Record<string, number> = {
  general:  0,
  fda:      8000,
  tisi:     10000,
  machinery:5000,
  special:  -1,
};

function termLabelKey(term: Term): string {
  return term === 'ddp' ? 'termDdp' : term === 'exw' ? 'termExw' : 'termFob';
}

export function calcLCL(
  form: LCLForm,
  term: Term,
  doc: string,
  t: Translator,
  // t for `bookingCalc` (to resolve termDdp etc.)
  tRoot: Translator,
): CalcResult | null {
  const cbm    = parseFloat(form.cbm)    || 0;
  const weight = parseFloat(form.weight) || 0;
  const cif    = parseFloat(form.cif)    || 0;

  if (cbm <= 0 && weight <= 0) return null;

  const baht = t('baht');
  const bahtSuffix = t('bahtSuffix');

  const surcharge = PRODUCT_SURCHARGE[form.productType] ?? 0;
  if (surcharge === -1) {
    return {
      amount: 0, currency: baht,
      label: t('labelSpecialLcl'),
      rows: [], note: t('noteSpecialLcl'),
    };
  }

  const originMult = form.origin === 'yiwu' ? 1.1 : 1;
  const seaFreight = Math.max(cbm * 1800 * originMult, weight * 6, 2500);
  const thc        = 2000;
  const docFee     = doc === 'none' ? 0 : doc === 'customs' ? 1200 : 600;

  let total = seaFreight + thc + docFee + surcharge;
  const rows = [
    { label: t('rowSeaFreight'), value: `${fmt(Math.round(seaFreight))} ${bahtSuffix}` },
    { label: t('rowThc'), value: `${fmt(thc)} ${bahtSuffix}` },
  ];

  if (surcharge > 0) {
    rows.push({ label: t('rowProductSurcharge'), value: `${fmt(surcharge)} ${bahtSuffix}` });
  }

  if (term === 'ddp') {
    const customsFee = 3500;
    const duty = cif > 0 ? Math.round(cif * 0.07) : 0;
    total += customsFee + duty;
    rows.push({ label: t('rowCustomsFee'), value: `${fmt(customsFee)} ${bahtSuffix}` });
    if (duty > 0) rows.push({ label: t('rowImportDuty'), value: `${fmt(duty)} ${bahtSuffix}` });
  }

  if (docFee > 0) {
    rows.push({ label: t('rowDocFee'), value: `${fmt(docFee)} ${bahtSuffix}` });
  }

  return {
    amount:   Math.round(total),
    currency: baht,
    label:    t('lclLabel', { term: tRoot(termLabelKey(term)) }),
    rows,
    note:     t('lclNote'),
  };
}

const FCL_BASE: Record<FclSize, Record<Term, number>> = {
  '20ft': { ddp: 58000, exw: 38000, fob: 45000 },
  '40ft': { ddp: 82000, exw: 55000, fob: 65000 },
};

export function calcFCL(
  form: FCLForm,
  size: FclSize,
  term: Term,
  t: Translator,
  tRoot: Translator,
): CalcResult | null {
  const cif = parseFloat(form.cif) || 0;
  const baht = t('baht');
  const bahtPerContainer = t('bahtPerContainer');
  const bahtSuffix = t('bahtSuffix');

  const surcharge = PRODUCT_SURCHARGE_FCL[form.productType] ?? 0;
  if (surcharge === -1) {
    return {
      amount: 0, currency: bahtPerContainer,
      label: t('labelSpecialFcl'),
      rows: [], note: t('noteSpecialFcl'),
    };
  }

  const originMult = form.origin === 'yiwu' ? 1.05 : 1;
  const base = Math.round(FCL_BASE[size][term] * originMult);
  const duty = term === 'ddp' && cif > 0 ? Math.round(cif * 0.07) : 0;
  const total = base + surcharge + duty;

  const rows = [
    { label: t('rowFclLane', { size }), value: `${fmt(base)} ${bahtSuffix}` },
  ];
  if (surcharge > 0) rows.push({ label: t('rowProductSurcharge'), value: `${fmt(surcharge)} ${bahtSuffix}` });
  if (duty > 0)      rows.push({ label: t('rowImportDuty'), value: `${fmt(duty)} ${bahtSuffix}` });

  return {
    amount:   total,
    currency: bahtPerContainer,
    label:    t('fclLabel', { size, term: tRoot(termLabelKey(term)) }),
    rows,
    note:     t('fclNote'),
  };
  // Note: `baht` is only used in the early-return branch above.
  void baht;
}

export function calcTruck(
  form: TruckForm,
  sub: TruckSub,
  t: Translator,
): CalcResult | null {
  const weight = parseFloat(form.weight) || 0;
  const cbm    = parseFloat(form.cbm)    || 0;

  if (weight <= 0 && cbm <= 0) return null;

  const baht = t('baht');
  const bahtSuffix = t('bahtSuffix');
  const kg = t('kg');

  if (sub === 'full') {
    return {
      amount: 0, currency: baht,
      label: t('labelSpecialTruck'),
      rows: [], note: t('noteSpecialTruck'),
    };
  }

  const ratePerKg = form.origin === 'yiwu' ? 85 : 75;
  const volWeight = cbm * 250;
  const chargeWeight = Math.max(weight, volWeight);
  const freight = Math.max(Math.round(chargeWeight * ratePerKg), 3500);

  const destSurcharge = form.dest === 'upcountry' ? 1500 : 0;
  const productSurcharge = PRODUCT_SURCHARGE[form.productType] ?? 0;
  const total = freight + destSurcharge + (productSurcharge === -1 ? 0 : productSurcharge);

  const rows = [
    { label: t('rowChargeWeight'), value: `${fmt(Math.round(chargeWeight))} ${kg}` },
    { label: t('rowTruckFreight'), value: `${fmt(freight)} ${bahtSuffix}` },
  ];
  if (destSurcharge > 0) rows.push({ label: t('rowUpcountryFee'), value: `${fmt(destSurcharge)} ${bahtSuffix}` });
  if (productSurcharge > 0) rows.push({ label: t('rowProductSurcharge'), value: `${fmt(productSurcharge)} ${bahtSuffix}` });

  return {
    amount:   total,
    currency: baht,
    label:    t('truckLabel'),
    rows,
    note:     t('truckNote'),
  };
}

export function calcAir(
  form: AirForm,
  t: Translator,
): CalcResult | null {
  const weight = parseFloat(form.weight) || 0;
  const w      = parseFloat(form.w)      || 0;
  const l      = parseFloat(form.l)      || 0;
  const h      = parseFloat(form.h)      || 0;

  if (weight <= 0 && (w <= 0 || l <= 0 || h <= 0)) return null;

  const baht = t('baht');
  const kg = t('kg');
  const bahtPerKg = t('bahtPerKg');

  const volWeight       = w > 0 && l > 0 && h > 0 ? (w * l * h) / 6000 : 0;
  const chargeableWeight = Math.max(weight, volWeight);

  const origin = form.origin.toLowerCase();
  let ratePerKg = 300;
  if (origin.includes('จีน') || origin.includes('china') || origin.includes('ฮ่องกง') || origin.includes('hong kong')) ratePerKg = 220;
  else if (origin.includes('ญี่ปุ่น') || origin.includes('japan')) ratePerKg = 260;

  const freight = Math.max(Math.round(chargeableWeight * ratePerKg), 1800);

  const rows = [
    { label: t('rowActualWeight'),     value: `${weight} ${kg}` },
    { label: t('rowVolWeight'),        value: volWeight > 0 ? `${volWeight.toFixed(2)} ${kg}` : '—' },
    { label: t('rowChargeableWeight'), value: `${chargeableWeight.toFixed(2)} ${kg}` },
    { label: t('rowRate'),             value: `${ratePerKg} ${bahtPerKg}` },
  ];

  return {
    amount:   freight,
    currency: baht,
    label:    t('airLabel'),
    rows,
    note:     t('airNote'),
  };
}
