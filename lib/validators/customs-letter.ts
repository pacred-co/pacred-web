/**
 * W11 — Zod schema for the customs-letter kit generator input.
 *
 * The letter generator is STATELESS (no DB row) — the form posts fields that
 * the API route turns straight into a `CustomsLetterData` PDF. This validator
 * guards the inputs (server action + API route both parse).
 */

import { z } from "zod";

export const CUSTOMS_LETTER_TYPE_VALUES = [
  "do_release", "do_split", "waiver_45", "poa", "amend", "lost_doc",
] as const;

export const CUSTOMS_CARRIER_VALUES = [
  "ZIM", "RCL", "COSCO", "HEDE", "FUJIT", "UPS", "CULINES", "SINOKOR", "OTHER",
] as const;

export const BL_RELEASE_STATUS_VALUES = ["OBL", "SWB", "TLX", "SURRENDER"] as const;

const optStr = (max: number) => z.string().trim().max(max).optional().nullable();
const optNum = (max: number) => z.coerce.number().min(0).max(max).optional().nullable();

export const splitSetSchema = z.object({
  setNo:           z.coerce.number().int().min(1).max(99),
  consignee:       z.string().trim().min(1).max(300),
  marksAndNumbers: optStr(500),
  packages:        optStr(200),
  description:     optStr(500),
  containerNo:     optStr(50),
  weightKg:        optNum(9_999_999.999),
  volumeCbm:       optNum(99_999.999),
});

export const generateCustomsLetterSchema = z.object({
  letterType:  z.enum(CUSTOMS_LETTER_TYPE_VALUES),
  carrierCode: z.enum(CUSTOMS_CARRIER_VALUES).optional().nullable(),
  carrierNameOverride: optStr(200),

  jobNo:        optStr(50),
  refNo:        optStr(100),
  issueDateIso: z.string().trim().min(8).max(40),

  // Sender (defaults applied server-side if blank).
  senderName:     z.string().trim().max(300).optional().nullable(),
  senderAddress:  z.string().trim().max(600).optional().nullable(),
  senderTaxId:    optStr(20),
  signatoryName:  optStr(200),
  signatoryTitle: optStr(120),

  // Consignee (required for most letters).
  consigneeName:    z.string().trim().min(1).max(300),
  consigneeAddress: z.string().trim().max(600).optional().nullable(),
  consigneeTaxId:   optStr(20),

  // Logistics.
  blNo:                  optStr(60),
  blStatus:              z.enum(BL_RELEASE_STATUS_VALUES).optional().nullable(),
  vesselVoyage:          optStr(120),
  portLoading:           optStr(120),
  portDischarge:         optStr(120),
  placeDelivery:         optStr(200),
  containerNo:           optStr(60),
  containerCodeInternal: optStr(40),
  cargoDescription:      optStr(500),
  totalCartons:          z.coerce.number().int().min(0).max(9_999_999).optional().nullable(),
  totalWeightKg:         optNum(9_999_999.999),
  totalVolumeCbm:        optNum(99_999.999),

  // POA.
  granteeName:     optStr(200),
  granteeIdCardNo: optStr(30),
  awbTrackingNo:   optStr(80),

  // Amend.
  amendOldValue: optStr(300),
  amendNewValue: optStr(300),
  amendField:    optStr(120),

  // Lost-doc.
  lostReceiptNumbers: z.array(z.string().trim().max(40)).max(100).optional().nullable(),
  courierName:        optStr(120),
  courierTrackingNo:  optStr(80),
  policeReportNote:   optStr(500),

  // Split-DO.
  splitSets: z.array(splitSetSchema).max(50).optional().nullable(),

  // Waiver-45.
  customsOffice:    optStr(120),
  arrivalDateIso:   optStr(40),
  estimatedDutyThb: optNum(999_999_999.99),
});

export type GenerateCustomsLetterInput = z.infer<typeof generateCustomsLetterSchema>;
