/**
 * Legacy `nameBank($ID)` (pcs-admin/include/function.php L301-323) — a
 * bank-code → Thai-name lookup used by the shop-disbursement history
 * detail (and other accounting surfaces that store a numeric bank code
 * in `tb_*.namebank`). Translated verbatim, same codes, same labels.
 *
 * Pure module — safe to import from server + client components.
 */

const BANK_NAMES: Record<string, string> = {
  "1": "กรุงเทพ",
  "2": "กสิกรไทย",
  "3": "กรุงไทย",
  "4": "ทหารไทย",
  "5": "ไทยพาณิชย์",
  "6": "กรุงศรีอยุธยา",
  "7": "เกียรตินาคิน",
  "8": "ซีไอเอ็มบีไทย",
  "9": "ทิสโก้",
  "10": "ธนชาต",
  "11": "ยูโอบี",
  "12": "แลนด์ แอนด์ เฮาส์",
  "13": "ออมสิน",
  "14": "พร้อมเพย์",
  "15": "CIMB",
  "16": "ICBC",
};

/** Legacy `nameBank()` — returns the Thai bank name for a numeric code,
 *  or "ไม่พบข้อมูล" (legacy default) for an unknown / empty code. */
export function bankName(code: string | null | undefined): string {
  if (code == null || code === "") return "ไม่พบข้อมูล";
  return BANK_NAMES[String(code)] ?? "ไม่พบข้อมูล";
}
