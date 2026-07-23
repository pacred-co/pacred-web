"use server";

/**
 * MOMO supplier-invoice → cost ingestion.
 *
 * Sets tb_forwarder.fcosttotalprice from the ACTUAL MOMO (ฮุย ไท่ต๋า) bill: UPLOAD the
 * invoice PDF (or paste its text) → match each line's tracking to a forwarder row →
 * PREVIEW the cost deltas → apply. The invoice's per-line "รวม (Total)" is the real cost
 * (more exact than the 2,500/CBM default — some lines are 4,700 or 0.00/149.00).
 *
 * Money-safety: gated to cost-roles (ultra/accounting/pricing · canViewCostProfit,
 * NOT super), preview-before-apply, apply RE-DERIVES from the same source server-side
 * (never trusts a client-passed cost), writes ONLY fcosttotalprice (+fprofittotal=0
 * so reports re-derive), skips PAID containers (their cost is locked — use the
 * paid-container cost editor), idempotent, and logged.
 *
 * 📄 PDF UPLOAD (2026-07-17) — owner: "ให้ทางบัญชี **อัพไฟล์ PDF** จากทาง MOMO — MOMO จะปล่อย
 *    ไฟล์มาให้บัญชีเป็นรอบๆ". Accounting used to open the PDF, Ctrl+A, Ctrl+C into a textarea
 *    for every file of every round. Now the client sends the raw file (base64) and NOTHING
 *    derived: the server extracts the text (lib/admin/momo-invoice-pdf.ts) and feeds it to the
 *    SAME parseMomoInvoiceText the paste uses, so every gate below is untouched. Apply
 *    re-extracts + re-parses from the same bytes — a client can no more hand us a cost through
 *    a PDF than it could through the paste. Text and file are MUTUALLY EXCLUSIVE (never
 *    "prefer one": which source we costed from must never be ambiguous on the money path).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 FILE-LEVEL GATES (2026-07-17) — apply REFUSES the whole file when either:
 *   1. Σ(lineTotal) does not foot the invoice's printed Sub-total (the confirmed
 *      ฿181.42 CBM-wrap bug: better to refuse than ingest 38 of 39 lines silently).
 *   2. the invoice's CBM reading could not be resolved from its own lines — we do
 *      not guess a formula on the money path.
 * Both refusals are re-asserted server-side on apply and name the REAL blocker.
 *
 * 🔴 ROW-LEVEL BLOCK (2026-07-17) — owner: "MOMO วางบิลเรามาเป็น Tracking ครับ แต่เรา
 *    คิดเป็นตู้ ไปตรวจให้ตรงกันนะครับ" + "ตรวจสอบว่าถูกต้องตรงกัน หรือมีอะไรขัดแย้ง
 *    แล้วให้ทำตัดจ่าย". A ตู้ conflict therefore BLOCKS that row's cost write until a
 *    human clears it (it used to only paint a warning and write anyway). Real prod
 *    example: INV-20260618-0003 SF1562783666170 — MOMO says ตู้ GZS260528-2, we hold
 *    PCS20260528-SEA01. Only the conflicting row is blocked; the rest of the file
 *    still applies (one bad line must not stop the round).
 *
 * 🔑 MATCHER (2026-07-17) — MOMO bills the first box of a split as `<base>-1/N`
 *    while we store it as the BARE base. Exact-match alone raised 3 false "ไม่พบใน
 *    ระบบ" on INV-20260708-0002 (฿5,091.50 / ฿34.78 / ฿181.42) — and an accountant
 *    "fixing" that by hand would have created duplicate rows / double cost. The
 *    fallback is deliberately narrow: ONLY `-1/N`, and only when the row's kg/CBM
 *    corroborate MOMO's (a bare row can be an aggregate header — never write cost
 *    onto a row we have not positively identified).
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit, COST_PROFIT_ROLES } from "@/lib/admin/money-visibility";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { transportModeFromCabinetName } from "@/lib/forwarder/cabinet-transport";
import { isContainerInBucket, type ReportCntPage } from "@/lib/admin/report-cnt-bucket";
import { parseMomoInvoiceText, type MomoCbmBasis } from "@/lib/admin/momo-invoice-parser";
import { extractMomoInvoicePdfText } from "@/lib/admin/momo-invoice-pdf";
import {
  invoiceLineCbm,
  buildReconcileTotals,
  type ReconcileTotals,
} from "@/lib/admin/momo-invoice-reconcile";
import { totalCbmOf } from "@/lib/forwarder/quantities";
import { baseTrackingOf } from "@/lib/integrations/momo-web/live-parcel-metrics";
import { MOMO_INVOICE_PDF_MAX_BYTES } from "@/lib/admin/momo-invoice-pdf-text";

/** base64 inflates ~4/3 → a 20 MB PDF is ~27 MB, well under the 50mb serverActions
 *  bodySizeLimit (next.config.ts). The real byte-length cap is re-asserted after decode
 *  — this bound only stops an absurd payload before we spend memory decoding it. */
const MAX_PDF_BASE64 = Math.ceil((MOMO_INVOICE_PDF_MAX_BYTES * 4) / 3) + 1024;

/** Exactly ONE source: pasted text OR an uploaded PDF. Never both, never neither —
 *  an ambiguous source on a money path is a bug waiting to happen. */
const ingestSchema = z
  .object({
    text: z.string().min(10).max(200_000).optional(),
    fileBase64: z.string().min(1).max(MAX_PDF_BASE64).optional(),
    /** apply-only: write cost for ONLY these tb_forwarder ids (the per-line "บันทึกต้นทุน"
     *  button · owner 2026-07-22). Omitted = every willApply row (บันทึกทั้งหมด). Ignored by
     *  preview. The server still re-derives every line from the source — this only narrows
     *  WHICH re-derived line gets written; a client can no more inject a cost this way than
     *  through the source. */
    onlyFids: z.array(z.number().int().positive()).max(2000).optional(),
  })
  .refine((v) => (v.text != null) !== (v.fileBase64 != null), {
    message: "ต้องส่งข้อความจากใบ หรือไฟล์ PDF อย่างใดอย่างหนึ่ง (ไม่ใช่ทั้งคู่)",
  });

type IngestInput = z.infer<typeof ingestSchema>;

/**
 * Resolve the ONE invoice text to parse — from the paste, or by extracting the uploaded
 * PDF **server-side**. The client never sends parsed lines, totals, or costs; it sends the
 * source, and every read is re-derived here (on preview AND on apply).
 */
async function resolveInvoiceText(input: IngestInput): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (input.text != null) return { ok: true, text: input.text };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(input.fileBase64 ?? "", "base64"));
  } catch {
    return { ok: false, error: "อ่านไฟล์ที่อัปโหลดไม่สำเร็จ — ลองเลือกไฟล์ใหม่อีกครั้ง" };
  }
  const res = await extractMomoInvoicePdfText(bytes);
  return res.ok ? { ok: true, text: res.text } : { ok: false, error: res.error };
}

async function assertCanEditCost(): Promise<string | null> {
  const roles = await getAdminRoles();
  if (!canViewCostProfit(roles)) return "ไม่มีสิทธิ์แก้ไขต้นทุน (เฉพาะ ultra / accounting / pricing)";
  return null;
}

/** MOMO's first-box-of-a-split form: "<base>-1/N". Siblings (-2/N, -3/N …) exist
 *  verbatim in tb_forwarder, so ONLY -1/N ever needs the bare-base fallback. */
const FIRST_BOX_RE = /^(.+)-1\/\d+$/;
const bareBaseOf = (t: string): string | null => t.match(FIRST_BOX_RE)?.[1] ?? null;

/** Same value within 1% (or 2 satang/units, whichever is larger). MOMO prints CBM to
 *  4dp while we store 6dp (2.0366 vs 2.036604), so an exact compare is wrong. */
const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.01);

type ForwarderRow = {
  id: number;
  ftrackingchn: string;
  fcabinetnumber: string | null;
  userid: string | null;
  fcosttotalprice: number;
  /** ค่านำเข้าจีน-ไทย ที่เราขายลูกค้า — the SELL leg MOMO's cost is compared against.
   *  Same column `/admin/report-cnt` labels "ราคาขาย" (cnt-list-table priceSum), so the
   *  two screens can never disagree. NOT the customer's whole bill (see the reconcile
   *  module's header) and NEVER written from here — display only. */
  ftotalprice: number;
  fweight: number;
  fvolume: number;
  /** famount + famountcount are the quantity SOT's inputs: `totalCbmOf` needs both to
   *  resolve fvolume's two conventions (row-total vs per-box). Loading fvolume alone
   *  understates our CBM by ×famount on every manual/legacy/TTW row. */
  famount: number;
  famountcount: string | null;
};

/**
 * Does this forwarder row really correspond to MOMO's `-1/N` line? Requires at least
 * one positive kg/CBM signal and NO contradiction. Fails closed when neither side has
 * a comparable figure (a 0-weight row proves nothing — see the known ฿0-weight rows).
 */
function corroborates(line: { kg: number; cbm: number }, row: ForwarderRow): boolean {
  const kgOk = line.kg > 0 && row.fweight > 0 ? near(line.kg, row.fweight) : null;
  const cbmOk = line.cbm > 0 && row.fvolume > 0 ? near(line.cbm, row.fvolume) : null;
  if (kgOk === false || cbmOk === false) return false;
  return kgOk === true || cbmOk === true;
}

export type MomoIngestPreviewRow = {
  tracking: string;
  invoiceCost: number;
  unitPrice: number;
  cbm: number;
  qty: number;
  totalMismatch: boolean;
  /** ใบพิมพ์เรท 0.00 → ตรวจยอดด้วยสูตรไม่ได้ (ยอดยังเป็นบิลจริง). */
  rateMissing: boolean;
  matched: boolean;
  /** จับคู่ด้วยวิธีไหน — "bare_base" = MOMO บิล -1/N แต่ระบบเราเก็บเป็นเลขเปล่า. */
  matchedVia: "exact" | "bare_base" | null;
  /** เลขแทรคกิ้งของแถวเราที่จับคู่ได้ (ต่างจากบนใบเมื่อ matchedVia = bare_base). */
  matchedTracking: string | null;
  fid: number | null;
  fcabinetnumber: string | null;
  userid: string | null;
  currentCost: number | null;
  ourKg: number | null;
  /** คิวของแถวเรา = row TOTAL ผ่าน `totalCbmOf` (กฎ famountcount) — ไม่ใช่ fvolume ดิบ. */
  ourCbm: number | null;
  /** คิวที่ MOMO เรียกเก็บบรรทัดนี้ ปรับเป็น "ยอดทั้งบรรทัด" แล้ว (ใบแบบ per_box = cbm × กล่อง). */
  invoiceCbm: number;
  /** น้ำหนัก (กก.) ที่พิมพ์บนใบบรรทัดนี้ — ใช้ทำสรุปยอดของใบตอนตัดจ่าย. */
  invoiceKg: number;
  /** ourCbm − invoiceCbm · + = ระบบเรามีคิวมากกว่าที่ใบเรียกเก็บ · null = จับคู่ไม่ได้. */
  cbmDiff: number | null;
  /** ค่านำเข้าที่เราขายลูกค้า (ftotalprice) · null = จับคู่ไม่ได้. */
  ourSell: number | null;
  /** กำไรที่ระบบแสดงอยู่ตอนนี้ = ขาย − ต้นทุนปัจจุบัน. */
  profitNow: number | null;
  /** กำไรหลังบันทึกต้นทุนจากใบนี้ = ขาย − ต้นทุนใบแจ้งหนี้. */
  profitAfter: number | null;
  /** เลขฐานของชิปเม้นที่แถวนี้สังกัด — คีย์ไปหา byShipment (อธิบายกำไรรายกล่องที่ติดลบ). */
  shipmentBase: string | null;
  cabinetPaid: boolean;
  willApply: boolean;
  /** ตู้ที่ MOMO ระบุบนใบ (null บนใบรุ่นเก่าที่ไม่พิมพ์ตู้). */
  invoiceCabinet: string | null;
  /** รหัสสมาชิกบนใบ (null = "No Code"). */
  invoiceMemberCode: string | null;
  /** 🔴 MOMO ระบุตู้ไม่ตรงกับ fcabinetnumber ของเรา → บล็อกแถวนี้ (owner: "ไปตรวจให้ตรงกัน"). */
  cabinetConflict: boolean;
  /** ⚪ ใบระบุตู้ แต่แถวเรายังไม่ผูกตู้ — ไม่ใช่ความขัดแย้ง แค่ยังไม่ผูก → เตือน ไม่บล็อก. */
  cabinetUnlinked: boolean;
  /** 🔴 มีหลายบรรทัดชี้มาที่แถวเดียวกัน → บล็อกทุกบรรทัดที่ชน (กันเขียนทับกันเงียบๆ). */
  duplicateFid: boolean;
  /** เหตุผลไทยว่าทำไมแถวนี้ยังบันทึกไม่ได้ + ต้องทำอะไรต่อ (null = พร้อม/ไม่ต้องทำ). */
  blockReason: string | null;
};

/**
 * ยอดรวม "ต่อตู้" ของใบรอบนี้ — owner: "MOMO วางบิลเรามาเป็น Tracking ครับ แต่เราคิดเป็นตู้
 * ไปตรวจให้ตรงกันนะครับ". ทุกอย่างข้างบนเป็นราย-แทรคกิ้ง (= grain ของใบ) แต่ "ตัดจ่ายค่าตู้"
 * เกิดที่ grain ของ **ตู้** (`tb_cnt_item.fCabinetNumber`) → ต้องมีชั้นนี้ ไม่งั้นบัญชีต้องเอา
 * เครื่องคิดเลขบวกเอง แล้วเดาว่าจะไปติ๊กตู้ไหนใน 44 ตู้.
 */
export type MomoInvoiceCabinetRollup = {
  /** เลขตู้ที่ใช้จ่ายจริง — ของเรา (`fcabinetnumber`) ถ้าจับคู่ได้ · ไม่งั้นตามที่ใบอ้าง. */
  cabinet: string | null;
  /** ผูกกับ tb_forwarder ของเราแล้ว (จ่ายได้) · false = ใบอ้างตู้นี้ แต่เราไม่มี. */
  linked: boolean;
  /** เรือ/รถ/อากาศ — ถอดจากชื่อตู้ (SOT: lib/forwarder/cabinet-transport.ts). */
  transportLabel: string | null;
  invoiceLines: number;
  /** Σ ต้นทุนของบรรทัดในใบ**รอบนี้** ที่ตกอยู่ในตู้นี้ = ยอดที่ MOMO เรียกเก็บรอบนี้. */
  invoiceTotal: number;
  blockedLines: number;
  willApplyLines: number;
  paid: boolean;
  /** จำนวนแถวทั้งหมดของตู้นี้ในระบบเรา (null = ไม่มีตู้นี้ในระบบ). */
  ourRows: number | null;
  /** Σ fcosttotalprice ทั้งตู้ในระบบเรา — **ไม่ใช่ยอดใบรอบนี้** (ดู partialRound). */
  ourCostSum: number | null;
  /** 🔴 ใบรอบนี้บิลไม่ครบทุกแถวของตู้ → Σ ตู้ ≠ Σ ใบ · แถวที่ MOMO ยังไม่บิลถือ
   *  "ต้นทุนประเมิน" (คิว × เรทตั้งต้น) อยู่ → จ่ายทั้งตู้ตอนนี้ = จ่ายเกิน. */
  partialRound: boolean;
  /** ส่วนต่าง Σ ตู้ − Σ ใบรอบนี้ (บวก = ในระบบมากกว่าที่ใบเรียกเก็บ). */
  roundDiff: number | null;
  /** Σ คิวที่ใบเรียกเก็บ ในตู้นี้ (บรรทัดรอบนี้เท่านั้น · ปรับเป็นยอดทั้งบรรทัดแล้ว). */
  invoiceCbm: number;
  /** Σ คิวของแถวเรา ที่ใบรอบนี้แตะ (จับคู่ได้เท่านั้น · กฎ famountcount). */
  ourCbm: number;
  /** ourCbm − invoiceCbm ในตู้นี้. */
  cbmDiff: number;
  /** Σ ราคาขาย (ค่านำเข้า) ของแถวที่ใบรอบนี้แตะ — เทียบกับ invoiceTotal ได้ตรงชุด. */
  ourSell: number;
  /** กำไรของชุดนี้หลังบันทึกต้นทุนจากใบ = ourSell − invoiceTotal (เฉพาะบรรทัดจับคู่ได้). */
  profitAfter: number;
  /** กำไรของชุดนี้ตามที่ระบบแสดงอยู่ตอนนี้ = ourSell − Σ ต้นทุนปัจจุบันของแถวชุดเดียวกัน. */
  profitNow: number;
  canPay: boolean;
  /** เหตุผลไทยว่าทำไมตู้นี้ยังตัดจ่ายไม่ได้ (null = จ่ายได้). */
  payBlockReason: string | null;
  /**
   * แท็บของหน้า "รายงานตู้" ที่ตู้นี้อยู่ (SOT: lib/admin/report-cnt-bucket.ts —
   * waiting = MIN(fstatus) < '4' · succeed = ≥ '4'). ลิงก์ตัดจ่ายต้องพาไปแท็บที่ถูก
   * ไม่งั้นเปิดมาแล้วไม่เจอตู้ (ตู้ที่ MOMO วางบิลมักถึงไทยแล้ว = อยู่แท็บ succeed
   * แต่ลิงก์เดิม `?actionPay=1` เด้งไปแท็บ waiting = ไม่เจอ). null = ตัดสินไม่ได้.
   */
  payPage: ReportCntPage | null;
};

/**
 * ยอด "ทั้งชิปเม้น" ของครอบครัวแทรคกิ้งหนึ่ง (เลขฐาน + ทุกกล่อง `-N`) — owner 2026-07-23:
 * *"งานที่ติดลบ คือยังไงนะครับ เป็นไปได้ด้วยหรอครับ ขายต่ำกว่าทุน มีอะไรผิดปกติหรือเปล่า"*
 *
 * 🔑 คำตอบ: **ไม่ผิดปกติ และไม่ใช่ขาดทุนจริง** — เป็นผลของการ "แบ่งกล่อง" ล้วนๆ:
 *   ขาย คิดตาม **น้ำหนัก** (฿/kg) · ทุน คิดตาม **คิว** (฿/CBM)
 * กล่องที่ **เบาแต่ใหญ่** จึงขายได้น้อยแต่กินทุนเยอะ → กำไรรายกล่องติดลบ ส่วนกล่องที่
 * **หนักแต่กะทัดรัด** จะเป็นตรงข้าม พอรวมทั้งชิปเม้นแล้วบวก. จุดคุ้มทุน = (ทุน/คิว) ÷ (ขาย/kg).
 *
 * ตัวอย่างจริงบน prod (1782459481 · PR10601 · เรท ฿11/kg · ทุน ฿2,500/คิว → คุ้มทุนที่ 227.3 kg/คิว):
 *   -3  47.5kg / 0.21924 = 216.7 kg/คิว → −฿25.60   (ต่ำกว่าจุดคุ้มทุน)
 *   -5  11.0kg / 0.05610 = 196.1 kg/คิว → −฿19.25   (ต่ำกว่าจุดคุ้มทุน)
 *   รวม 7 กล่อง 266kg / 0.8545 = 311.3 kg/คิว → **+฿789.75** ✅
 *
 * ⚠️ Σ ต้องมาจาก **ทุกพี่น้องใน DB** ไม่ใช่แค่บรรทัดที่อยู่บนใบรอบนี้ — ถ้ารวมแค่บนใบแล้วเรียกว่า
 * "ทั้งชิปเม้น" จะเป็นการโกหกเมื่อ MOMO บิลมาไม่ครบครอบครัว (§0f อย่ามั่ว).
 * แนวเดียวกับ ForwarderProfitPanel ที่ทำ rollup นี้ไว้แล้วบนหน้า /admin/forwarders/[fNo].
 */
export type MomoInvoiceShipmentRollup = {
  /** เลขฐานของครอบครัว (ตัด `-N` / `-N/M` ออกแล้ว). */
  base: string;
  /** จำนวนแถวพี่น้องทั้งหมดใน DB (ไม่ใช่แค่ที่อยู่บนใบรอบนี้). */
  rows: number;
  weightKg: number;
  cbm: number;
  /** Σ ftotalprice ของทั้งครอบครัว. */
  sell: number;
  /** Σ fcosttotalprice ของทั้งครอบครัว (ค่าที่เก็บอยู่ตอนนี้). */
  cost: number;
  /** sell − cost · + = ทั้งชิปเม้นกำไรจริง แม้บางกล่องจะติดลบ. */
  profit: number;
  /** kg ต่อคิว ของทั้งชิปเม้น (null = ไม่มีคิว). */
  densityKgPerCbm: number | null;
};

export type MomoIngestPreview = {
  invoiceNo: string | null;
  grandTotal: number | null;
  rows: MomoIngestPreviewRow[];
  /** ยอดสรุป "ต่อตู้" ของใบรอบนี้ — สะพานไปหน้าตัดจ่ายค่าตู้. */
  byCabinet: MomoInvoiceCabinetRollup[];
  /**
   * สรุปเทียบทั้งใบ (owner 2026-07-23) — คิวในระบบ vs คิวที่ MOMO เรียกเก็บ + ดิฟ ·
   * ต้นทุนที่ MOMO เก็บ vs ที่ระบบบันทึกไว้ · ราคาขาย · และกำไรก่อน/หลังบันทึก + ดิฟ.
   * Σ เฉพาะบรรทัดที่จับคู่ได้ (บรรทัดที่ไม่พบแยกรายงานไว้ใน unmatched* — ห้ามกลืนหาย).
   */
  reconcile: ReconcileTotals;
  /** ยอดทั้งชิปเม้นต่อครอบครัวแทรคกิ้ง — ใช้ตอบ "ทำไมกล่องนี้ติดลบ" (ดู type ข้างบน). */
  byShipment: MomoInvoiceShipmentRollup[];
  /** "หักภาษีค่าขนส่ง ณ ที่จ่าย (WHT 1%)" ที่พิมพ์บนใบ (null = อ่านไม่เจอ). */
  whtThb: number | null;
  summary: {
    total: number;
    matched: number;
    willApply: number;
    unmatched: number;
    paidSkipped: number;
    cabinetConflicts: number;
    cabinetUnlinked: number;
    matchedViaBase: number;
    duplicateBlocked: number;
    /** รวมทุกบรรทัดที่ถูกบล็อกไม่ให้เขียนต้นทุน (ไม่พบ / ตู้ไม่ตรง / ชี้ซ้ำ). */
    blocked: number;
    totalMismatches: number;
  };
  /** Sub-total ที่พิมพ์บนใบ (null = อ่านไม่เจอ). */
  subTotal: number | null;
  /** Σ ต้นทุนทุกบรรทัดที่แกะได้. */
  linesTotal: number;
  /** Σ ตรงกับ Sub-total — ถ้า false การบันทึกจะถูกปฏิเสธทั้งไฟล์. */
  reconciles: boolean;
  /** วิธีอ่านคอลัมน์คิวของใบนี้ (ตรวจจากตัวใบเอง) · null = ชี้ขาดไม่ได้/ไม่จำเป็น. */
  cbmBasis: MomoCbmBasis | null;
  cbmBasisUsable: boolean;
  cbmBasisReason: string;
  /** พร้อมกดบันทึกไหม (ผ่านทั้ง 2 ประตูระดับไฟล์). */
  canApply: boolean;
};

const TRANSPORT_LABEL: Record<string, string> = { "1": "รถ", "2": "เรือ", "3": "อากาศ" };
const round2 = (n: number): number => Math.round(n * 100) / 100;
/** CBM keeps 6dp (we store 6dp · MOMO prints 4dp) — rounding to 2 would invent a diff. */
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;

/**
 * Roll the per-tracking invoice lines up to the ตู้ grain that ตัดจ่ายค่าตู้ actually
 * happens at, and reconcile that against what the container really holds.
 *
 * 🔴 The number this exists to expose (verified prod 2026-07-17 · INV-20260708-0002):
 *    ตู้ GZS260620-2 — the invoice bills **3 of our 7 rows** for ฿10,858.25, but the
 *    container's Σ fcosttotalprice is ฿19,470.33. The ฿8,612.08 gap is the OTHER 4 rows
 *    carrying an ESTIMATED cost (คิว × 2,500 default), which MOMO has simply not billed
 *    yet — they release files เป็นรอบๆ. Paying "the container total" here would over-pay
 *    MOMO by ฿8,612.08 for goods they never invoiced. `partialRound` + `roundDiff` put
 *    that on screen instead of leaving it for a calculator to miss.
 */
async function buildCabinetRollup(
  admin: ReturnType<typeof createAdminClient>,
  rows: MomoIngestPreviewRow[],
  paidCabs: Set<string>,
): Promise<MomoInvoiceCabinetRollup[]> {
  // Attribute each line to the ตู้ we would PAY: our link wins; fall back to the ตู้ the
  // invoice asserts so an unmatched line still surfaces under the ตู้ it claims (rather
  // than vanishing from the ตู้ view — the accountant must see it before paying).
  type Acc = {
    cabinet: string | null;
    linked: boolean;
    invoiceLines: number;
    invoiceTotal: number;
    blockedLines: number;
    willApplyLines: number;
    /** The comparison Σ — MATCHED lines only (same honesty rule as the file-level
     *  reconcile: a line we could not find has no คิว/ขาย/ต้นทุน of ours to compare). */
    invoiceCbm: number;
    ourCbm: number;
    ourSell: number;
    matchedInvoiceTotal: number;
    matchedCurrentCost: number;
  };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const linked = !!r.fcabinetnumber;
    const cabinet = r.fcabinetnumber ?? r.invoiceCabinet ?? null;
    const key = cabinet ?? "ไม่ระบุตู้";
    const cur =
      acc.get(key) ??
      {
        cabinet, linked, invoiceLines: 0, invoiceTotal: 0, blockedLines: 0, willApplyLines: 0,
        invoiceCbm: 0, ourCbm: 0, ourSell: 0, matchedInvoiceTotal: 0, matchedCurrentCost: 0,
      };
    cur.linked = cur.linked || linked;
    cur.invoiceLines += 1;
    cur.invoiceTotal += r.invoiceCost;
    if (r.matched) {
      cur.invoiceCbm += r.invoiceCbm;
      cur.ourCbm += r.ourCbm ?? 0;
      cur.ourSell += r.ourSell ?? 0;
      cur.matchedInvoiceTotal += r.invoiceCost;
      cur.matchedCurrentCost += r.currentCost ?? 0;
    }
    if (!r.matched || r.cabinetConflict || r.duplicateFid) cur.blockedLines += 1;
    if (r.willApply) cur.willApplyLines += 1;
    acc.set(key, cur);
  }

  // What each container really holds — the OTHER half of the reconcile. Without this we
  // could only ever report the invoice back to itself.
  const cabs = Array.from(acc.values())
    .map((a) => a.cabinet)
    .filter((c): c is string => !!c);
  const ours = new Map<string, { rows: number; costSum: number; minFstatus: string | null }>();
  if (cabs.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("fcabinetnumber, fcosttotalprice, fstatus")
      .in("fcabinetnumber", cabs);
    if (error) {
      console.error(`[momo-ingest rollup] failed`, { code: error.code, message: error.message });
    }
    for (const r of (data ?? []) as Array<{
      fcabinetnumber: string | null;
      fcosttotalprice: number | null;
      fstatus: string | null;
    }>) {
      const c = r.fcabinetnumber;
      if (!c) continue;
      const cur = ours.get(c) ?? { rows: 0, costSum: 0, minFstatus: null };
      cur.rows += 1;
      cur.costSum += Number(r.fcosttotalprice ?? 0);
      // mirror the page's MIN(fstatus) (SQL MIN skips NULL) — drives which tab the ตู้ is on.
      if (r.fstatus != null) {
        cur.minFstatus = cur.minFstatus == null || r.fstatus < cur.minFstatus ? r.fstatus : cur.minFstatus;
      }
      ours.set(c, cur);
    }
  }

  return Array.from(acc.values())
    .map((a): MomoInvoiceCabinetRollup => {
      const mine = a.cabinet ? ours.get(a.cabinet) : undefined;
      const paid = a.cabinet ? paidCabs.has(a.cabinet) : false;
      const ourRows = mine?.rows ?? null;
      const ourCostSum = mine ? round2(mine.costSum) : null;
      const invoiceTotal = round2(a.invoiceTotal);
      // "MOMO ยังบิลไม่ครบตู้นี้" — the invoice covers fewer rows than the container holds.
      const partialRound = ourRows != null && a.invoiceLines < ourRows;
      const roundDiff = ourCostSum != null ? round2(ourCostSum - invoiceTotal) : null;

      // Owner's rule: "ตรวจให้ตรงกันก่อน แล้วค่อยตัดจ่าย" → a ตู้ with any unresolved line
      // must not be payable from here. Fail-closed, and always name the REAL blocker.
      let payBlockReason: string | null = null;
      if (!a.cabinet) {
        payBlockReason = "ใบไม่ได้ระบุตู้ และจับคู่แทรคกิ้งกับระบบไม่ได้ — ตัดจ่ายไม่ได้ (ไม่รู้ว่าเป็นตู้ไหน)";
      } else if (!a.linked) {
        payBlockReason = `ใบอ้างตู้ "${a.cabinet}" แต่ไม่มีตู้นี้ผูกกับรายการนำเข้าในระบบเรา — ตรวจกับโกดังก่อน`;
      } else if (paid) {
        payBlockReason = `ตู้นี้ตัดจ่ายค่าตู้ไปแล้ว — จ่ายซ้ำไม่ได้ (ดูประวัติที่ รายการจ่ายเงินตู้)`;
      } else if (a.blockedLines > 0) {
        payBlockReason = `มี ${a.blockedLines} บรรทัดของตู้นี้ที่ยังตรวจไม่ผ่าน (ตู้ไม่ตรง / ไม่พบในระบบ / ชี้ซ้ำ) — ต้องตรวจให้ตรงกันก่อน จึงจะตัดจ่ายตู้นี้ได้`;
      }

      return {
        cabinet: a.cabinet,
        linked: a.linked,
        transportLabel: a.cabinet
          ? (TRANSPORT_LABEL[transportModeFromCabinetName(a.cabinet) ?? ""] ?? null)
          : null,
        invoiceLines: a.invoiceLines,
        invoiceTotal,
        blockedLines: a.blockedLines,
        willApplyLines: a.willApplyLines,
        paid,
        ourRows,
        ourCostSum,
        partialRound,
        roundDiff,
        invoiceCbm: round6(a.invoiceCbm),
        ourCbm: round6(a.ourCbm),
        cbmDiff: round6(a.ourCbm - a.invoiceCbm),
        ourSell: round2(a.ourSell),
        profitAfter: round2(a.ourSell - a.matchedInvoiceTotal),
        profitNow: round2(a.ourSell - a.matchedCurrentCost),
        canPay: payBlockReason == null,
        payBlockReason,
        payPage:
          mine?.minFstatus == null
            ? null
            : isContainerInBucket(mine.minFstatus, "succeed")
              ? "succeed"
              : "waiting",
      };
    })
    .sort((a, b) => b.invoiceTotal - a.invoiceTotal);
}

/**
 * รวมยอด "ทั้งชิปเม้น" ต่อครอบครัวแทรคกิ้ง — ตอบคำถาม "ทำไมกล่องนี้ขายต่ำกว่าทุน".
 *
 * ต้องอ่าน **ทุกพี่น้องจาก DB** ไม่ใช่แค่บรรทัดบนใบ (ดู doc ของ MomoInvoiceShipmentRollup):
 * ใช้แพทเทิน `.or(eq base, like base-%)` + re-check `baseTrackingOf` ฝั่ง client แบบเดียวกับ
 * `resolveMaoAnchorIds` — การ re-check นี้จำเป็น ไม่ใช่ของแถม เพราะ LIKE prefix จะกินเลขอื่น
 * (`1783582` จะ swallow `1783582423` ถ้าไม่เช็คซ้ำ).
 *
 * fail-soft: อ่านไม่ได้ → คืน [] → หน้าจอแค่ไม่มีคำอธิบายเสริม ไม่พังและไม่บล็อกการบันทึก.
 */
async function buildShipmentRollup(
  admin: ReturnType<typeof createAdminClient>,
  bases: readonly string[],
): Promise<MomoInvoiceShipmentRollup[]> {
  const uniq = Array.from(new Set(bases.filter((b) => b !== "")));
  if (uniq.length === 0) return [];

  type Sib = {
    ftrackingchn: string | null;
    fweight: number | null;
    fvolume: number | null;
    famount: number | null;
    famountcount: string | null;
    ftotalprice: number | null;
    fcosttotalprice: number | null;
  };
  const acc = new Map<string, { rows: number; kg: number; cbm: number; sell: number; cost: number }>();

  const CHUNK = 40;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const filter = slice.map((b) => `ftrackingchn.eq.${b},ftrackingchn.like.${b}-%`).join(",");
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("ftrackingchn, fweight, fvolume, famount, famountcount, ftotalprice, fcosttotalprice")
      .or(filter)
      .limit(2000);
    if (error) {
      console.error(`[momo-ingest shipment] failed`, { code: error.code, message: error.message });
      continue; // fail-soft — คำอธิบายหายไปเฉยๆ ไม่กระทบยอดเงินใดๆ
    }
    for (const r of (data ?? []) as Sib[]) {
      const t = (r.ftrackingchn ?? "").trim();
      const b = baseTrackingOf(t);
      if (!b || !slice.includes(b)) continue; // กัน LIKE prefix กินเลขอื่น
      const cur = acc.get(b) ?? { rows: 0, kg: 0, cbm: 0, sell: 0, cost: 0 };
      cur.rows += 1;
      cur.kg += Number(r.fweight ?? 0);
      cur.cbm += totalCbmOf({ fvolume: r.fvolume, famount: r.famount, famountcount: r.famountcount });
      cur.sell += Number(r.ftotalprice ?? 0);
      cur.cost += Number(r.fcosttotalprice ?? 0);
      acc.set(b, cur);
    }
  }

  return Array.from(acc.entries()).map(([base, a]): MomoInvoiceShipmentRollup => {
    const cbm = round6(a.cbm);
    return {
      base,
      rows: a.rows,
      weightKg: round2(a.kg),
      cbm,
      sell: round2(a.sell),
      cost: round2(a.cost),
      profit: round2(a.sell - a.cost),
      densityKgPerCbm: cbm > 0 ? Math.round((a.kg / cbm) * 10) / 10 : null,
    };
  });
}

async function buildPreview(text: string): Promise<MomoIngestPreview> {
  const parsed = parseMomoInvoiceText(text);
  const admin = createAdminClient();

  // Look up the invoice trackings AND (for "-1/N" lines) their bare bases in one trip.
  const lookups = new Set<string>();
  for (const l of parsed.lines) {
    lookups.add(l.tracking);
    const base = bareBaseOf(l.tracking);
    if (base) lookups.add(base);
  }

  const fByTracking = new Map<string, ForwarderRow>();
  if (lookups.size > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(
        "id, ftrackingchn, fcabinetnumber, userid, fcosttotalprice, ftotalprice, fweight, fvolume, famount, famountcount",
      )
      .in("ftrackingchn", Array.from(lookups));
    if (error) console.error(`[momo-ingest match] failed`, { code: error.code, message: error.message });
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const t = r.ftrackingchn as string | null;
      // first match per tracking wins (invoice trackings are 1:1 incl -N splits)
      if (t && !fByTracking.has(t)) {
        fByTracking.set(t, {
          id: r.id as number,
          ftrackingchn: t,
          fcabinetnumber: (r.fcabinetnumber as string | null) ?? null,
          userid: (r.userid as string | null) ?? null,
          fcosttotalprice: Number(r.fcosttotalprice ?? 0),
          ftotalprice: Number(r.ftotalprice ?? 0),
          fweight: Number(r.fweight ?? 0),
          fvolume: Number(r.fvolume ?? 0),
          famount: Number(r.famount ?? 0),
          famountcount: (r.famountcount as string | null) ?? null,
        });
      }
    }
  }

  // Resolve each invoice line → our row: exact first, then the narrow "-1/N" → bare
  // fallback, and only when kg/CBM corroborate. Never fuzzier than this.
  type Resolved = { row: ForwarderRow; via: "exact" | "bare_base" } | null;
  const resolved: Resolved[] = parsed.lines.map((l) => {
    const exact = fByTracking.get(l.tracking);
    if (exact) return { row: exact, via: "exact" };
    const base = bareBaseOf(l.tracking);
    if (!base) return null;
    const bare = fByTracking.get(base);
    if (!bare) return null;
    // A bare base can be an aggregate bill-header. Only accept it when the numbers agree.
    return corroborates(l, bare) ? { row: bare, via: "bare_base" } : null;
  });

  // Two invoice lines resolving to ONE row would silently overwrite each other's cost.
  const fidCount = new Map<number, number>();
  for (const r of resolved) if (r) fidCount.set(r.row.id, (fidCount.get(r.row.id) ?? 0) + 1);

  // Which matched cabinets are PAID (tb_cnt_item present) → skip those.
  const cabs = Array.from(
    new Set(resolved.map((r) => r?.row.fcabinetnumber).filter((c): c is string => !!c)),
  );
  const paidCabs = new Set<string>();
  if (cabs.length > 0) {
    const { data: paid, error } = await admin.from("tb_cnt_item").select("fCabinetNumber").in("fCabinetNumber", cabs);
    if (error) console.error(`[momo-ingest paid] failed`, { code: error.code, message: error.message });
    for (const r of (paid ?? []) as Array<{ fCabinetNumber: string | null }>) if (r.fCabinetNumber) paidCabs.add(r.fCabinetNumber);
  }

  const rows: MomoIngestPreviewRow[] = parsed.lines.map((l, i) => {
    const hit = resolved[i];
    const f = hit?.row ?? null;
    const cabinetPaid = f?.fcabinetnumber ? paidCabs.has(f.fcabinetnumber) : false;
    const currentCost = f ? f.fcosttotalprice : null;
    // The 4 comparison numbers (owner 2026-07-23: "คิวในระบบ / คิวที่ MOMO เรียกเก็บ /
    // ดิฟ / ต้นทุน MOMO / ขาย / diff กำไร"). Both sides normalised to a row TOTAL before
    // they meet — invoice via the file's cbmBasis, ours via the famountcount rule.
    const invoiceCbm = invoiceLineCbm(l, parsed.cbmBasis);
    const ourCbm = f ? totalCbmOf(f) : null;
    const ourSell = f ? f.ftotalprice : null;
    // เทียบตู้เฉพาะเมื่อมีทั้ง 2 ฝั่ง (ใบรุ่นเก่าไม่พิมพ์ตู้ → ไม่ถือว่าขัดแย้ง)
    const cabinetConflict = !!l.cabinet && !!f?.fcabinetnumber && l.cabinet !== f.fcabinetnumber;
    const cabinetUnlinked = !!l.cabinet && !!f && !f.fcabinetnumber;
    const duplicateFid = !!f && (fidCount.get(f.id) ?? 0) > 1;
    const costDiffers = !!f && Math.abs((currentCost ?? 0) - l.lineTotal) > 0.005;

    // เหตุผลรายแถว — บอกสิ่งที่บล็อกจริง + ต้องทำอะไรต่อ (ห้าม "ผิดพลาด N" ลอยๆ)
    let blockReason: string | null = null;
    if (!f) {
      blockReason = bareBaseOf(l.tracking)
        ? `ไม่พบในระบบ — MOMO บิลเป็นกล่องแรกของชุดแยก (${l.tracking}) และหาแถวเลขเปล่า "${bareBaseOf(l.tracking)}" ที่น้ำหนัก/คิวตรงกันไม่ได้ · ตรวจว่ามีรายการนำเข้านี้จริงไหม แล้วแจ้งทีมพัฒนา`
        : `ไม่พบแทรคกิ้งนี้ในระบบ${l.cabinet ? ` (ใบระบุตู้ ${l.cabinet})` : ""} · MOMO อาจบิลของที่เรายังไม่ได้รับเข้า — ตรวจกับโกดังก่อน`;
    } else if (duplicateFid) {
      blockReason = `มีหลายบรรทัดบนใบชี้มาที่รายการเดียวกัน (#${f.id} · ${f.ftrackingchn}) — บันทึกไม่ได้ เพราะต้นทุนจะเขียนทับกัน · แจ้งทีมพัฒนา`;
    } else if (cabinetConflict) {
      blockReason = `🔴 ตู้ไม่ตรง — ใบว่า "${l.cabinet}" แต่ระบบเราผูกไว้กับ "${f.fcabinetnumber}" · ต้องตรวจให้ตรงกันก่อน จึงจะตัดจ่ายต้นทุนแถวนี้ได้`;
    } else if (cabinetPaid) {
      blockReason = `ข้าม — ตู้ ${f.fcabinetnumber} จ่ายค่าตู้ไปแล้ว ต้นทุนถูกล็อก (แก้ที่หน้าจ่ายค่าตู้ถ้าจำเป็น)`;
    } else if (!costDiffers) {
      blockReason = null; // ตรงแล้ว — ไม่ต้องทำอะไร
    }

    const willApply = !!f && !cabinetPaid && !cabinetConflict && !duplicateFid && costDiffers;

    return {
      tracking: l.tracking,
      invoiceCost: l.lineTotal,
      unitPrice: l.unitPrice,
      cbm: l.cbm,
      qty: l.qty,
      totalMismatch: l.totalMismatch,
      rateMissing: l.rateMissing,
      matched: !!f,
      matchedVia: hit?.via ?? null,
      matchedTracking: f?.ftrackingchn ?? null,
      fid: f?.id ?? null,
      fcabinetnumber: f?.fcabinetnumber ?? null,
      userid: f?.userid ?? null,
      currentCost,
      ourKg: f ? f.fweight : null,
      ourCbm,
      invoiceCbm,
      invoiceKg: l.kg,
      cbmDiff: ourCbm == null ? null : round6(ourCbm - invoiceCbm),
      ourSell,
      profitNow: ourSell == null ? null : round2(ourSell - (currentCost ?? 0)),
      profitAfter: ourSell == null ? null : round2(ourSell - l.lineTotal),
      shipmentBase: f ? baseTrackingOf(f.ftrackingchn) || null : null,
      cabinetPaid,
      willApply,
      invoiceCabinet: l.cabinet,
      invoiceMemberCode: l.memberCode,
      cabinetConflict,
      cabinetUnlinked,
      duplicateFid,
      blockReason,
    };
  });

  const byCabinet = await buildCabinetRollup(admin, rows, paidCabs);
  // ยอดทั้งชิปเม้น — เฉพาะครอบครัวที่แถวบนใบนี้แตะ (อธิบายกำไรรายกล่องที่ติดลบ)
  const byShipment = await buildShipmentRollup(
    admin,
    rows.map((r) => r.shipmentBase).filter((b): b is string => !!b),
  );

  return {
    invoiceNo: parsed.invoiceNo,
    grandTotal: parsed.grandTotal,
    rows,
    byCabinet,
    reconcile: buildReconcileTotals(rows),
    byShipment,
    whtThb: parsed.whtThb,
    summary: {
      total: rows.length,
      matched: rows.filter((r) => r.matched).length,
      willApply: rows.filter((r) => r.willApply).length,
      unmatched: rows.filter((r) => !r.matched).length,
      paidSkipped: rows.filter((r) => r.matched && r.cabinetPaid).length,
      cabinetConflicts: rows.filter((r) => r.cabinetConflict).length,
      cabinetUnlinked: rows.filter((r) => r.cabinetUnlinked).length,
      matchedViaBase: rows.filter((r) => r.matchedVia === "bare_base").length,
      duplicateBlocked: rows.filter((r) => r.duplicateFid).length,
      blocked: rows.filter((r) => !r.matched || r.cabinetConflict || r.duplicateFid).length,
      totalMismatches: rows.filter((r) => r.totalMismatch).length,
    },
    subTotal: parsed.subTotal,
    linesTotal: parsed.linesTotal,
    reconciles: parsed.reconciles,
    cbmBasis: parsed.cbmBasis,
    cbmBasisUsable: parsed.cbmBasisUsable,
    cbmBasisReason: parsed.cbmBasisReason,
    canApply: parsed.reconciles && parsed.cbmBasisUsable,
  };
}

/** ข้อความปฏิเสธระดับไฟล์ — ต้องบอก "ตัวที่บล็อกจริง" ไม่ใช่เหตุผลลอยๆ (§0f: อย่ามั่ว). */
function fileRefusal(p: MomoIngestPreview): string | null {
  const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!p.reconciles) {
    if (p.subTotal == null) {
      return `อ่านยอด "ค่าขนส่งทั้งหมด (Sub-total)" บนใบไม่เจอ — ปฏิเสธทั้งไฟล์ (กันเขียนต้นทุนผิด) · แกะได้ ${p.rows.length} บรรทัด Σ ฿${baht(p.linesTotal)} · กรุณาวางข้อความจากใบให้ครบทั้งใบ รวมส่วนท้าย`;
    }
    const diff = Math.round((p.subTotal - p.linesTotal) * 100) / 100;
    return `ยอดที่แกะได้ไม่ตรงกับ Sub-total บนใบ — ปฏิเสธทั้งไฟล์ (กันเขียนต้นทุนผิด) · แกะได้ ${p.rows.length} บรรทัด Σ ฿${baht(p.linesTotal)} vs Sub-total ฿${baht(p.subTotal)} · ${diff > 0 ? "ขาด" : "เกิน"} ฿${baht(Math.abs(diff))} (มีบรรทัดตกหล่นหรือรูปแบบใบเปลี่ยน — อย่าเพิ่งบันทึก)`;
  }
  if (!p.cbmBasisUsable) {
    return `อ่านวิธีคิดคิวของใบนี้ไม่ชัด — ปฏิเสธทั้งไฟล์ (ระบบไม่เดาสูตรบนเส้นทางเงิน) · ${p.cbmBasisReason}`;
  }
  return null;
}

/** Read-only preview — extract (if PDF) + parse + match + compute deltas. No writes. */
export async function previewMomoInvoiceCost(input: unknown): Promise<AdminActionResult<MomoIngestPreview>> {
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const src = await resolveInvoiceText(parsed.data);
    if (!src.ok) return { ok: false, error: src.error };
    return { ok: true, data: await buildPreview(src.text) };
  });
}

/** Apply — re-derives from the SAME source server-side (re-extracting the PDF from its own
 *  bytes when that's the source), writes fcosttotalprice on the willApply rows (matched ·
 *  unpaid · ตู้ตรง · cost differs). Idempotent + logged. */
export async function applyMomoInvoiceCost(input: unknown): Promise<AdminActionResult<{ applied: number; skipped: number; invoiceNo: string | null; requested: number }>> {
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };

    const src = await resolveInvoiceText(parsed.data);
    if (!src.ok) return { ok: false, error: src.error };
    // Which source this cost was read from — a money write must never be ambiguous about
    // its origin when someone audits it months later.
    const source: "pdf_upload" | "paste" = parsed.data.fileBase64 != null ? "pdf_upload" : "paste";
    // Per-line บันทึกต้นทุน (owner 2026-07-22): narrow to the chosen fids. The server still
    // re-derives every line below — this only decides which re-derived willApply row is
    // written. Omitted = every willApply row (บันทึกทั้งหมด).
    const onlyFids = parsed.data.onlyFids && parsed.data.onlyFids.length > 0 ? new Set(parsed.data.onlyFids) : null;
    const preview = await buildPreview(src.text);
    // 🔴 fail-closed: a parse that doesn't foot the Sub-total, or whose CBM reading we
    // could not establish from the invoice itself, never writes money.
    const refusal = fileRefusal(preview);
    if (refusal) {
      await logAdminAction(adminId, "momo_invoice.ingest_refused", "tb_forwarder", preview.invoiceNo ?? "", {
        invoiceNo: preview.invoiceNo,
        source,
        reason: preview.reconciles ? "cbm_basis_undecided" : "subtotal_mismatch",
        lines: preview.rows.length,
        linesTotal: preview.linesTotal,
        subTotal: preview.subTotal,
        cbmBasis: preview.cbmBasis,
      });
      return { ok: false, error: refusal };
    }
    const admin = createAdminClient();
    // Rows the caller asked to write (respect onlyFids). `requested` = how many willApply
    // rows are in scope, so the client can report "เขียน X · ข้าม (ตรงแล้ว/ล็อก) …".
    const scoped = preview.rows.filter((r) => r.willApply && r.fid != null && (onlyFids == null || onlyFids.has(r.fid)));
    let applied = 0;
    for (const r of scoped) {
      const { error } = await admin
        .from("tb_forwarder")
        .update({ fcosttotalprice: r.invoiceCost, fprofittotal: 0 })
        .eq("id", r.fid as number)
        .neq("fcosttotalprice", r.invoiceCost); // optimistic — skip if already set
      if (error) {
        console.error(`[momo-ingest apply] fid ${r.fid}`, { code: error.code, message: error.message });
        continue;
      }
      applied += 1;
    }

    // 🧾 PROVENANCE (mig 0267 · momo_invoice_line) — record that a REAL MOMO invoice line
    // billed each POSITIVELY-IDENTIFIED row (matched · ตู้ตรง · not shared), regardless of
    // whether the cost write above ran (a re-apply where cost already equals, or a paid
    // container, is still real provenance). This is the ONE new write here — additive,
    // idempotent (UNIQUE invoice_no,ftrackingchn → re-apply DO-NOTHING), and it NEVER
    // changes the fcosttotalprice write or any amount. Best-effort: if it fails (e.g. the
    // 0267 table isn't migrated yet), the cost writes still stand and coverage degrades to
    // "ยังไม่มีข้อมูลใบ" (never a false "ครบ"). Powers lib/admin/cabinet-billing-coverage.
    const provenanceRows = preview.rows
      .filter((r) => r.matched && r.fid != null && !r.cabinetConflict && !r.duplicateFid)
      .map((r) => ({
        fid: r.fid as number,
        ftrackingchn: r.tracking, // the tracking AS MOMO PRINTED IT (may be "<base>-1/N")
        fcabinetnumber: r.fcabinetnumber,
        invoice_no: preview.invoiceNo ?? "",
        amount: r.invoiceCost,
        source,
        applied_by: adminId,
      }));
    let provenanceWritten = 0;
    if (provenanceRows.length > 0) {
      const { error: provErr } = await admin
        .from("momo_invoice_line")
        .upsert(provenanceRows, { onConflict: "invoice_no,ftrackingchn", ignoreDuplicates: true });
      if (provErr) {
        console.error(`[momo-ingest provenance] failed`, { code: provErr.code, message: provErr.message });
        await logAdminAction(adminId, "momo_invoice.provenance_failed", "momo_invoice_line", preview.invoiceNo ?? "", {
          invoiceNo: preview.invoiceNo, source, lines: provenanceRows.length, error: provErr.message,
        });
      } else {
        provenanceWritten = provenanceRows.length;
      }
    }

    await logAdminAction(adminId, "momo_invoice.ingest_cost", "tb_forwarder", preview.invoiceNo ?? "", {
      invoiceNo: preview.invoiceNo,
      source,
      applied,
      requested: scoped.length,
      onlyFids: onlyFids ? [...onlyFids] : null,
      candidates: preview.summary.willApply,
      unmatched: preview.summary.unmatched,
      cabinetConflicts: preview.summary.cabinetConflicts,
      matchedViaBase: preview.summary.matchedViaBase,
      provenanceRows: provenanceWritten,
      linesTotal: preview.linesTotal,
      subTotal: preview.subTotal,
      cbmBasis: preview.cbmBasis,
    });
    return { ok: true, data: { applied, skipped: scoped.length - applied, invoiceNo: preview.invoiceNo, requested: scoped.length } };
  });
}
