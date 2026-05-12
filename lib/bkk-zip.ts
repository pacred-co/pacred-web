/**
 * Postal codes that qualify for Pacred's free-shipping promo zone:
 * BKK + 5 surrounding metro provinces.
 *
 * Ported verbatim from D:\xampp\htdocs\pcscargo\member\include\function.php
 * lines 3-9 (arrZIPCodeBKK + arrZIPCodeNakhonPathom + ...).
 *
 * Frozen as a Set for O(1) lookup at order placement.
 */

const ZIP_BKK = [
  10600, 10510, 10110, 10230, 10900, 10150, 10210, 10400, 10300, 10170,
  10170, 10140, 10600, 10700, 10600, 10240, 10150, 10120, 10800, 10260,
  10150, 10700, 10500, 10220, 10160, 10240, 10330, 10250, 10100, 10400,
  10200, 10260, 10160, 10510, 10120, 10400, 10140, 10520, 10230, 10310,
  10110, 10250, 10240, 10100, 10120, 10220, 10530, 10160, 10210, 10310,
];
const ZIP_NAKHON_PATHOM = [73170, 73110];
const ZIP_NONTHABURI    = [11130, 11110, 11140, 11120, 11000, 11150];
const ZIP_SAMUT_PRAKAN  = [10560, 10540, 10540, 10130, 10290, 10270];
const ZIP_SAMUT_SAKHON  = [74110, 74000];
const ZIP_PATHUM_THANI: number[] = [];

const FREE_SHIPPING_SET = new Set<string>(
  [
    ...ZIP_BKK, ...ZIP_NAKHON_PATHOM, ...ZIP_NONTHABURI,
    ...ZIP_SAMUT_PRAKAN, ...ZIP_SAMUT_SAKHON, ...ZIP_PATHUM_THANI,
  ].map(String),
);

export function isFreeShippingZip(postal: string | null | undefined): boolean {
  if (!postal) return false;
  return FREE_SHIPPING_SET.has(postal.trim());
}
