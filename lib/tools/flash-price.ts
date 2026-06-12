/**
 * Flash Express domestic-shipping price calculator — a faithful port of the
 * legacy PCS `calPriceFlash()` (+ helpers) from
 *   pcs-admin/include/function.php  L2210-2599.
 *
 * The legacy admin checker `check-price-flash.php` hardcodes amount=1, type=1
 * and feeds the form fields straight into calPriceFlash. We mirror the math
 * exactly so the result matches the legacy "ผลลัพธ์การคำนวณ จาก PCS System".
 *
 * Pure / no DB — safe to unit-test and to call from a Server Component.
 *
 * The model (legacy):
 *   - CBM = w*l*h / 1_000_000  (cm³ → m³)  — used only to decide type 1 vs 2.
 *   - size = w + l + h  (girth sum, cm).
 *   - bangkok index: 0 if the destination zip is in the BKK/ปริมณฑล list, else 1.
 *   - calFlashPriceKG(kg)  → [priceBKK, priceUpcountry]  (tiered by kg).
 *   - calFlashPriceCBM(size) → [priceBKK, priceUpcountry] (tiered by girth-sum).
 *   - price = max(priceKg[bangkok], priceSize[bangkok]).
 *   - kg > 50  → error "น้ำหนักเกิน 50 kg." + price 0 (Flash won't carry).
 *   - size > 280 → error "ขนาดเกิน" + price 0.
 *   - remoteArea / touristArea flags add +50 baht each (surfaced separately,
 *     exactly as the legacy did — it shows "รวมราคา" with the +50 line).
 */

/** Tiered KG price table — returns [priceBKK, priceUpcountry]. Legacy L2210. */
export function calFlashPriceKg(kg: number): [number, number] {
  if (kg > 50) return [0, 0];
  if (kg > 49) return [635, 590];
  if (kg > 48) return [620, 580];
  if (kg > 47) return [605, 570];
  if (kg > 46) return [590, 560];
  if (kg > 45) return [575, 550];
  if (kg > 44) return [560, 540];
  if (kg > 43) return [545, 530];
  if (kg > 42) return [530, 520];
  if (kg > 41) return [510, 510];
  if (kg > 40) return [500, 500];
  if (kg > 39) return [485, 460];
  if (kg > 38) return [470, 450];
  if (kg > 37) return [455, 440];
  if (kg > 36) return [440, 430];
  if (kg > 35) return [425, 420];
  if (kg > 34) return [410, 410];
  if (kg > 33) return [400, 400];
  if (kg > 32) return [390, 390];
  if (kg > 31) return [380, 380];
  if (kg > 30) return [370, 370];
  if (kg > 29) return [340, 340];
  if (kg > 28) return [330, 330];
  if (kg > 27) return [320, 320];
  if (kg > 26) return [310, 310];
  if (kg > 25) return [300, 300];
  if (kg > 24) return [290, 290];
  if (kg > 23) return [280, 280];
  if (kg > 22) return [270, 270];
  if (kg > 21) return [260, 260];
  if (kg > 20) return [250, 250];
  if (kg > 19) return [230, 230];
  if (kg > 18) return [220, 220];
  if (kg > 17) return [210, 210];
  if (kg > 16) return [200, 200];
  if (kg > 15) return [190, 190];
  if (kg > 14) return [175, 175];
  if (kg > 13) return [165, 165];
  if (kg > 12) return [155, 155];
  if (kg > 11) return [145, 145];
  if (kg > 10) return [135, 135];
  if (kg > 9) return [115, 115];
  if (kg > 8) return [105, 105];
  if (kg > 7) return [95, 95];
  if (kg > 6) return [80, 80];
  if (kg > 5) return [70, 70];
  if (kg > 4) return [55, 60];
  if (kg > 3) return [45, 50];
  if (kg > 2) return [35, 45];
  if (kg > 1) return [30, 40];
  return [25, 35];
}

/** Tiered girth-sum (w+l+h) price table — returns [priceBKK, priceUpcountry]. Legacy L2369. */
export function calFlashPriceSize(size: number): [number, number] {
  if (size > 275) return [560, 540];
  if (size > 270) return [545, 530];
  if (size > 265) return [530, 520];
  if (size > 260) return [510, 510];
  if (size > 255) return [500, 500];
  if (size > 250) return [485, 460];
  if (size > 245) return [470, 450];
  if (size > 240) return [455, 440];
  if (size > 235) return [440, 430];
  if (size > 230) return [425, 420];
  if (size > 225) return [410, 410];
  if (size > 220) return [400, 400];
  if (size > 215) return [390, 390];
  if (size > 210) return [380, 380];
  if (size > 205) return [370, 370];
  if (size > 200) return [340, 340];
  if (size > 195) return [330, 330];
  if (size > 190) return [320, 320];
  if (size > 185) return [310, 310];
  if (size > 180) return [300, 300];
  if (size > 175) return [290, 290];
  if (size > 170) return [280, 280];
  if (size > 165) return [270, 270];
  if (size > 160) return [260, 260];
  if (size > 155) return [250, 250];
  if (size > 150) return [230, 230];
  if (size > 145) return [220, 220];
  if (size > 140) return [210, 210];
  if (size > 135) return [200, 200];
  if (size > 130) return [190, 190];
  if (size > 125) return [175, 175];
  if (size > 120) return [165, 165];
  if (size > 115) return [155, 155];
  if (size > 110) return [145, 145];
  if (size > 105) return [135, 135];
  if (size > 100) return [115, 115];
  if (size > 95) return [105, 105];
  if (size > 90) return [95, 95];
  if (size > 85) return [80, 80];
  if (size > 80) return [70, 70];
  if (size > 70) return [55, 60];
  if (size > 60) return [45, 50];
  if (size > 50) return [35, 45];
  if (size > 40) return [30, 40];
  // legacy: size <= 40 → [25, 35]
  return [25, 35];
}

/** CBM (m³) from dimensions in cm. Legacy calFlashVolumeCMB L2513. */
export function calFlashVolumeCbm(width: number, length: number, height: number): number {
  return (width * length * height) / 1_000_000;
}

/**
 * พื้นที่ห่างไกล (remote-area zip list) — legacy L2518 `$zipCodeRemoteArea`.
 * Updated 26/02/2023 (per the legacy comment). Verbatim port (deduped to a Set
 * for O(1) lookup — legacy used array_search which is membership-only).
 */
const REMOTE_AREA_ZIPS = new Set<string>([
  "20120", "23170", "71180", "71240", "50260", "50270", "50310", "50350",
  "55130", "55220", "58110", "58120", "58130", "58140", "58150", "63170",
  "67260", "63150", "81150", "82150", "82160", "94000", "94110", "94120",
  "94130", "94140", "94150", "94160", "94170", "94180", "94220", "94230",
  "95000", "95110", "95120", "95130", "95140", "95150", "96000", "96110",
  "96120", "96130", "96140", "96150", "96160", "96170", "96180", "96190",
  "96210", "96220", "94190", "95160", "95170",
]);

/**
 * พื้นที่ท่องเที่ยวพิเศษ (special tourist-area zip list) — legacy L2520
 * `$zipSpecialTouristArea`. Updated 26/02/2023. Verbatim port (deduped Set).
 */
const TOURIST_AREA_ZIPS = new Set<string>([
  "84320", "84330", "84140", "84310", "84280", "81210", "84360", "83110",
  "83100", "83000", "83130", "83150", "83120",
]);

/**
 * BKK / ปริมณฑล zip list — legacy L2537 `$zipCodeBKK`. If the destination zip
 * is in this set the cheaper "BKK" price column (index 0) is used; otherwise
 * the "ตจว" (upcountry) column (index 1). Verbatim port.
 */
const BKK_ZIPS = new Set<string>([
  "10020", "10100", "10110", "10120", "10130", "10140", "10150", "10160",
  "10170", "10200", "10210", "10220", "10230", "10240", "10250", "10260",
  "10270", "10280", "10290", "10300", "10310", "10330", "10400", "10501",
  "10510", "10520", "10530", "10540", "10550", "10560", "10600", "10700",
  "10800", "10900", "11000", "11110", "11120", "11130", "11140", "11150",
  "12000", "12110", "12120", "12130", "12140", "12150", "12160", "12170",
  "73000", "73110", "73120", "73130", "73140", "73150", "73160", "73170",
  "73180", "73210", "73220", "74000", "74110", "74120", "74130",
]);

export type FlashPriceResult = {
  /** Always 200 in the legacy contract (no real status codes used). */
  status: number;
  /** 1 = standard (CBM == volume) · 2 = oversize/volumetric path. */
  type: number;
  amount: number;
  zipCodeEndway: string;
  /** Girth-sum-derived price for the resolved column. */
  priceSize: number;
  /** Weight-derived price for the resolved column. */
  priceKg: number;
  /** Final price = max(priceSize, priceKg), zeroed on over-limit. */
  price: number;
  /** Human error string (Thai) — empty when ok. */
  error: string;
  /** "กทมและปริมณฑล" or "ตจว". */
  nameEndway: string;
  /** 1 if destination is a remote-area zip (+50 baht). */
  remoteArea: number;
  /** 1 if destination is a special tourist-area zip (+50 baht). */
  touristArea: number;
};

/**
 * Faithful port of legacy `calPriceFlash()` (L2521). The legacy admin form
 * always passes amount=1, type=1, volume=0; we keep the full signature so the
 * math (incl. the type-1-vs-2 branch and the amount-averaging path) is 1:1.
 */
export function calPriceFlash(
  amount: number,
  _zipCodeOrigin: string,
  zipCodeEndway: string,
  width: number,
  length: number,
  height: number,
  kg: number,
  volume: number,
  type: number,
): FlashPriceResult {
  const cbm = calFlashVolumeCbm(width, length, height);
  // Legacy: if |CBM - volume| <= 0.0001 and type != 2 → type 1, else type 2.
  if (Math.abs(cbm - volume) <= 0.0001 && type !== 2) {
    type = 1;
  } else {
    type = 2;
  }

  const bangkokMatch = BKK_ZIPS.has(zipCodeEndway);
  // Legacy uses array_search → truthy index. We mirror the 0/1 column index +
  // the name label.
  const bangkok = bangkokMatch ? 0 : 1;
  const nameEndway = bangkokMatch ? "กทมและปริมณฑล" : "ตจว";

  let remoteArea = REMOTE_AREA_ZIPS.has(zipCodeEndway) ? 1 : 0;
  const touristArea = TOURIST_AREA_ZIPS.has(zipCodeEndway) ? 1 : 0;

  const size = width + length + height;

  let priceSize: number;
  let priceKg: number;

  // Legacy oversize/multi-piece branch: amount>1 with kg>50 or size>280, or type==2.
  if (((amount > 1) && (kg > 50 || size > 280)) || type === 2) {
    const kgAvg = kg / amount;
    priceSize = calFlashPriceSize(size)[bangkok] * amount;
    priceKg = calFlashPriceKg(kgAvg)[bangkok] * amount;
    remoteArea = remoteArea ? 1 : 0;
  } else {
    priceKg = calFlashPriceKg(kg)[bangkok];
    priceSize = calFlashPriceSize(size)[bangkok];
    remoteArea = remoteArea ? 1 : 0;
  }

  let price = priceSize;
  if (priceKg > priceSize) price = priceKg;

  let error = "";
  // Note: legacy averages kg above only in the oversize branch; the over-limit
  // guard uses the (possibly averaged) kg value just like the original.
  const kgForGuard = (((amount > 1) && (kg > 50 || size > 280)) || type === 2) ? kg / amount : kg;
  if (kgForGuard > 50) {
    error += " น้ำหนักเกิน 50 kg.";
    price = 0;
  }
  if (size > 280) {
    error += " ขนาดเกิน";
    price = 0;
  }

  return {
    status: 200,
    type,
    amount,
    zipCodeEndway,
    priceSize,
    priceKg,
    price,
    error,
    nameEndway,
    remoteArea,
    touristArea,
  };
}

/** The remote/tourist zip lists, exposed read-only for the UI reference panel. */
export const FLASH_REMOTE_AREA_ZIPS = Array.from(REMOTE_AREA_ZIPS).sort();
export const FLASH_TOURIST_AREA_ZIPS = Array.from(TOURIST_AREA_ZIPS).sort();
