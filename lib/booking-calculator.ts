import type { CalcResult, LCLForm, FCLForm, TruckForm, AirForm, Term, FclSize, TruckSub } from '@/types/booking';

function fmt(n: number) {
  return n.toLocaleString('th-TH');
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

export function calcLCL(form: LCLForm, term: Term, doc: string): CalcResult | null {
  const cbm    = parseFloat(form.cbm)    || 0;
  const weight = parseFloat(form.weight) || 0;
  const cif    = parseFloat(form.cif)    || 0;

  if (cbm <= 0 && weight <= 0) return null;

  const surcharge = PRODUCT_SURCHARGE[form.productType] ?? 0;
  if (surcharge === -1) {
    return {
      amount: 0, currency: 'บาท',
      label: 'สินค้าพิเศษ — กรุณาติดต่อเจ้าหน้าที่เพื่อขอใบเสนอราคา',
      rows: [], note: 'สินค้าประเภทนี้ต้องผ่านการพิจารณาพิเศษ ราคาขึ้นอยู่กับชนิดสินค้าและเอกสาร',
    };
  }

  const originMult = form.origin === 'yiwu' ? 1.1 : 1;
  const seaFreight = Math.max(cbm * 1800 * originMult, weight * 6, 2500);
  const thc        = 2000;
  const docFee     = doc === 'none' ? 0 : doc === 'customs' ? 1200 : 600;

  let total = seaFreight + thc + docFee + surcharge;
  let rows = [
    { label: 'ค่าระวางเรือ', value: `${fmt(Math.round(seaFreight))} บาท` },
    { label: 'THC ปลายทาง', value: `${fmt(thc)} บาท` },
  ];

  if (surcharge > 0) {
    rows.push({ label: 'ค่าดำเนินการพิเศษ', value: `${fmt(surcharge)} บาท` });
  }

  if (term === 'ddp') {
    const customsFee = 3500;
    const duty = cif > 0 ? Math.round(cif * 0.07) : 0;
    total += customsFee + duty;
    rows.push({ label: 'ค่าเคลียร์ศุลกากร', value: `${fmt(customsFee)} บาท` });
    if (duty > 0) rows.push({ label: 'ภาษีนำเข้าโดยประมาณ', value: `${fmt(duty)} บาท` });
  }

  if (docFee > 0) {
    rows.push({ label: 'ค่าเอกสาร', value: `${fmt(docFee)} บาท` });
  }

  const termLabel: Record<Term, string> = {
    ddp: 'DDP (ครบจบรวมภาษี)',
    exw: 'EXW (ยกเว้นภาษี)',
    fob: 'FOB (ถึงท่าเรือไทย)',
  };

  return {
    amount:   Math.round(total),
    currency: 'บาท',
    label:    `ราคาประเมินเบื้องต้น · LCL แชร์ตู้ · ${termLabel[term]}`,
    rows,
    note:     'ราคานี้เป็นการประเมินเบื้องต้น — ราคาจริงขึ้นอยู่กับช่วงเวลา เส้นทาง และน้ำหนักจริงหน้าโกดัง ทีมงานจะยืนยันราคาภายใน 5 นาที',
  };
}

const FCL_BASE: Record<FclSize, Record<Term, number>> = {
  '20ft': { ddp: 58000, exw: 38000, fob: 45000 },
  '40ft': { ddp: 82000, exw: 55000, fob: 65000 },
};

export function calcFCL(form: FCLForm, size: FclSize, term: Term): CalcResult | null {
  const cif = parseFloat(form.cif) || 0;

  const surcharge = PRODUCT_SURCHARGE_FCL[form.productType] ?? 0;
  if (surcharge === -1) {
    return {
      amount: 0, currency: 'บาท / ตู้',
      label: 'สินค้าพิเศษ — กรุณาติดต่อเจ้าหน้าที่',
      rows: [], note: 'สินค้าพิเศษ/อันตราย ราคาขึ้นอยู่กับชนิดและมาตรฐานการขนส่ง',
    };
  }

  const originMult = form.origin === 'yiwu' ? 1.05 : 1;
  const base = Math.round(FCL_BASE[size][term] * originMult);
  const duty = term === 'ddp' && cif > 0 ? Math.round(cif * 0.07) : 0;
  const total = base + surcharge + duty;

  const rows = [
    { label: `ค่าระวาง + ดำเนินการ (${size})`, value: `${fmt(base)} บาท` },
  ];
  if (surcharge > 0) rows.push({ label: 'ค่าดำเนินการพิเศษ', value: `${fmt(surcharge)} บาท` });
  if (duty > 0)      rows.push({ label: 'ภาษีนำเข้าโดยประมาณ', value: `${fmt(duty)} บาท` });

  const termLabel: Record<Term, string> = {
    ddp: 'DDP (ครบจบรวมภาษี)',
    exw: 'EXW (ยกเว้นภาษี)',
    fob: 'FOB (ถึงท่าเรือไทย)',
  };

  return {
    amount:   total,
    currency: 'บาท / ตู้',
    label:    `ราคาประเมิน · FCL ${size} · ${termLabel[term]}`,
    rows,
    note:     'ราคาขึ้นอยู่กับเส้นทาง ท่าเรือ และช่วงเวลา — ผู้เชี่ยวชาญจะยืนยันราคาภายใน 15 นาที',
  };
}

export function calcTruck(form: TruckForm, sub: TruckSub): CalcResult | null {
  const weight = parseFloat(form.weight) || 0;
  const cbm    = parseFloat(form.cbm)    || 0;

  if (weight <= 0 && cbm <= 0) return null;

  if (sub === 'full') {
    return {
      amount: 0, currency: 'บาท',
      label: 'เหมารถ — กรุณาติดต่อเจ้าหน้าที่เพื่อรับใบเสนอราคา',
      rows: [], note: 'เหมารถขึ้นอยู่กับขนาดรถ ประเภทสินค้า และเส้นทางจริง',
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
    { label: 'น้ำหนักที่คิดค่าบริการ', value: `${fmt(Math.round(chargeWeight))} กก.` },
    { label: 'ค่าขนส่งแชร์รถ',         value: `${fmt(freight)} บาท` },
  ];
  if (destSurcharge > 0) rows.push({ label: 'ค่าส่งต่างจังหวัด', value: `${fmt(destSurcharge)} บาท` });
  if (productSurcharge > 0) rows.push({ label: 'ค่าดำเนินการพิเศษ', value: `${fmt(productSurcharge)} บาท` });

  return {
    amount:   total,
    currency: 'บาท',
    label:    'ราคาประเมิน · ทางรถ DDP · แชร์รถ',
    rows,
    note:     'DDP จ่ายครั้งเดียวรวมภาษี ส่งถึงหน้าบ้าน — ผู้เชี่ยวชาญยืนยันราคาจริงใน 5 นาที',
  };
}

export function calcAir(form: AirForm): CalcResult | null {
  const weight = parseFloat(form.weight) || 0;
  const w      = parseFloat(form.w)      || 0;
  const l      = parseFloat(form.l)      || 0;
  const h      = parseFloat(form.h)      || 0;

  if (weight <= 0 && (w <= 0 || l <= 0 || h <= 0)) return null;

  const volWeight       = w > 0 && l > 0 && h > 0 ? (w * l * h) / 6000 : 0;
  const chargeableWeight = Math.max(weight, volWeight);

  const origin = form.origin.toLowerCase();
  let ratePerKg = 300;
  if (origin.includes('จีน') || origin.includes('china') || origin.includes('ฮ่องกง')) ratePerKg = 220;
  else if (origin.includes('ญี่ปุ่น') || origin.includes('japan')) ratePerKg = 260;

  const freight = Math.max(Math.round(chargeableWeight * ratePerKg), 1800);

  const rows = [
    { label: 'น้ำหนักจริง',             value: `${weight} กก.` },
    { label: 'น้ำหนักปริมาตร',          value: volWeight > 0 ? `${volWeight.toFixed(2)} กก.` : '—' },
    { label: 'Chargeable Weight',        value: `${chargeableWeight.toFixed(2)} กก.` },
    { label: 'อัตรา',                   value: `${ratePerKg} บาท/กก.` },
  ];

  return {
    amount:   freight,
    currency: 'บาท',
    label:    'ราคาประเมิน · ทางอากาศ',
    rows,
    note:     'Chargeable Weight = Max(น้ำหนักจริง, กว้าง×ยาว×สูง÷6000) · ราคาอาจเปลี่ยนแปลงตาม Airline Surcharge',
  };
}
