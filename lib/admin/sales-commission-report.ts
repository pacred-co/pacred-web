/**
 * Sales-commission per-ORDER report data (ปอน 2026-07-29).
 *
 * Faithful to the legacy PCS "ทำรายการเบิกค่าคอมของเซลล์"
 * (pcs-admin/include/pages/withdraw-commission-sale/add.php): the report is
 * DRIVEN by the customer payment (tb_wallet_hs.date · status='2'), joined to the
 * ฝากนำเข้า order (tb_forwarder) and the customer (tb_users). Each row = one paid
 * import order, and it belongs to the MONTH THE CUSTOMER PAID (owner rule:
 * "จ่ายตังเดือนไหน นับเป็นของเดือนนั้น").
 *
 * Attribution: a customer's assigned rep — tb_users.adminIDSale (เซลล์) or
 * adminIDCS (cs). We bound the scan to the rep's own customers first, then their
 * settled wallet payments in the month, then the real tb_forwarder rows those
 * payments reference (tb_wallet_hs.reforder also carries shop/yuan ids → we
 * intersect with tb_forwarder.id + require userid match, exactly like the legacy
 * `LEFT JOIN … AND f.userID = wh.userID`).
 *
 * ⚠️ Commission (col 13) is NOT computed here — ปอน: "ไม่ต้องคำนวณค่าคอม"
 * (dataset first). The column is surfaced as "—" in the table; enabling it later
 * = (ftotalprice − fdiscount) × 0.01 via lib/sales-commission/calc.ts.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { sortRows, pickSortKey, normalizeDir } from "./report-sort";
import { logger } from "@/lib/logger";

const SCOPE = "sales-commission-report";

/** แถว/หน้า สำหรับ pagination ของตารางค่าคอม (totals + totals.count ยังคิดทั้งหมดเสมอ) */
export const COMMISSION_PAGE_SIZE = 50;

const WAREHOUSE_LABEL: Record<string, string> = { "1": "กวางโจว", "2": "อี้อู" };
const PRODUCT_LABEL: Record<string, string> = {
  "1": "ทั่วไป",
  "2": "มอก.",
  "3": "อย.",
  "4": "พิเศษ",
  "5": "ควบคุมพิเศษ",
};
const TRANSPORT_LABEL: Record<string, string> = { "1": "ทางรถ", "2": "ทางเรือ", "3": "ทางอากาศ" };

export type CommissionPosition = "sales" | "cs";

export type CommissionRow = {
  paidDate: string | null; // วันที่ชำระเงิน (tb_wallet_hs.date)
  createdDate: string | null; // วันที่สร้าง (tb_forwarder.fdate)
  orderId: number; // เลขที่ออเดอร์
  tracking: string; // แทรกกิ้ง
  cabinet: string; // เลขตู้
  warehouseLabel: string; // โกดังจีน
  transportMode: string; // "1" รถ · "2" เรือ · "3" อากาศ (chip color)
  transportLabel: string; // ขนส่งทาง
  productLabel: string; // ประเภทสินค้า
  weight: number; // น้ำหนัก
  cbm: number; // ปริมาตร
  price: number; // ราคานำเข้าจีน - ไทย
  discount: number; // ส่วนลด
  memberCode: string; // รหัสสมาชิก (tb_users.userID)
  customerName: string; // ชื่อ-นามสกุล (เก็บไว้ · ตารางไม่แสดงแล้ว)
  walletHsId: number | null; // tb_wallet_hs.id ของการชำระที่ settle → ลิงก์ /admin/wallet/[id] (ดูสลิป)
};

export type CommissionReport = {
  rows: CommissionRow[];
  totals: { weight: number; cbm: number; price: number; discount: number; count: number };
  rangeStart: string; // YYYY-MM-DD (display)
  rangeEnd: string; // YYYY-MM-DD (last day of month · display)
};

/** คอลัมน์ที่กดเรียงได้ (ตรงกับ field ของ CommissionRow · หัวตาราง SortHeader) */
const COMMISSION_SORT_KEYS: readonly (keyof CommissionRow)[] = [
  "paidDate", "createdDate", "orderId", "tracking", "cabinet", "warehouseLabel",
  "transportLabel", "productLabel", "weight", "cbm", "price", "discount", "memberCode",
];

const EMPTY = (start: string, end: string): CommissionReport => ({
  rows: [],
  totals: { weight: 0, cbm: 0, price: 0, discount: 0, count: 0 },
  rangeStart: start,
  rangeEnd: end,
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Read every row of a filtered query (PostgREST truncates at 1000 · owner leak fix pattern). */
async function pageAll<T>(
  query: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await query(from, from + page - 1);
    if (error) {
      logger.warn(SCOPE, "read failed", { reason: error.message });
      break;
    }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** "2026-07-31" → "2026-08-01" (exclusive upper bound so the whole "to" day
 *  is included — tb_wallet_hs.date is a datetime). UTC to avoid TZ date-shift. */
function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const num = (v: string | number | null): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

export async function getSalesCommissionReport(opts: {
  position: CommissionPosition;
  repId: string; // ว่าง = ทั้งหมด (ทุกเซลล์รวมกัน)
  dateFrom: string; // YYYY-MM-DD (inclusive)
  dateTo: string; // YYYY-MM-DD (inclusive)
  page?: number; // หน้า (1-based · COMMISSION_PAGE_SIZE แถว/หน้า) · totals ยังคิดทั้งหมด
  sort?: string; // คอลัมน์ที่เรียง (keyof CommissionRow · default paidDate)
  dir?: string; // asc | desc (default asc)
}): Promise<CommissionReport> {
  const { position, repId, dateFrom, dateTo } = opts;
  const startInclusive = dateFrom;
  const endExclusive = addOneDay(dateTo);

  const admin = createAdminClient();
  const attrField = position === "cs" ? "adminIDCS" : "adminIDSale";

  // 1) the rep's customers (attribution = the customer's assigned rep).
  // repId ว่าง = "ทั้งหมด" → ลูกค้าทุกคนที่มีเซลล์ผู้รับผิดชอบ (attrField ไม่ว่าง)
  type CustomerRow = { userID: string; userName: string | null; userLastName: string | null };
  const customers = await pageAll<CustomerRow>(async (from, to) => {
    let q = admin.from("tb_users").select("userID, userName, userLastName");
    q = repId ? q.eq(attrField, repId) : q.not(attrField, "is", null).neq(attrField, "");
    const res = await q.range(from, to);
    return { data: res.data as CustomerRow[] | null, error: res.error };
  });
  if (customers.length === 0) return EMPTY(dateFrom, dateTo);

  const nameByUser = new Map<string, string>();
  for (const c of customers) {
    nameByUser.set(c.userID, `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim());
  }
  const userIds = customers.map((c) => c.userID);

  // 2) their settled wallet payments IN the month (the pay date drives the bucket)
  type WalletRow = { id: number; reforder: string | null; userid: string | null; date: string | null };
  const wallet: WalletRow[] = [];
  for (const grp of chunk(userIds, 300)) {
    const part = await pageAll<WalletRow>(async (from, to) => {
      const res = await admin
        .from("tb_wallet_hs")
        .select("id, reforder, userid, date")
        .eq("status", "2")
        .in("userid", grp)
        .gte("date", startInclusive)
        .lt("date", endExclusive)
        .range(from, to);
      return { data: res.data as WalletRow[] | null, error: res.error };
    });
    wallet.push(...part);
  }
  if (wallet.length === 0) return EMPTY(dateFrom, dateTo);

  // reforder → latest pay date in the month (one row per order · legacy GROUP BY f.ID)
  const payDateByOrder = new Map<string, string>();
  const walletUserByOrder = new Map<string, string>();
  const walletIdByOrder = new Map<string, number>(); // → ลิงก์ /admin/wallet/[id] (ดูสลิป)
  for (const w of wallet) {
    const ref = (w.reforder ?? "").trim();
    if (!ref || !w.userid || !w.date) continue;
    const prev = payDateByOrder.get(ref);
    if (!prev || w.date > prev) {
      payDateByOrder.set(ref, w.date);
      walletIdByOrder.set(ref, w.id);
    }
    walletUserByOrder.set(ref, w.userid);
  }
  const orderIds = [...payDateByOrder.keys()];
  // tb_wallet_hs.reforder also carries shop/yuan order ids (e.g. "P22349"); the
  // tb_forwarder.id column is bigint, so a non-numeric id makes the WHOLE
  // .in("id", …) query error → keep numeric ids only (the real forwarder rows).
  const numericOrderIds = orderIds.filter((id) => /^\d+$/.test(id));
  if (numericOrderIds.length === 0) return EMPTY(dateFrom, dateTo);

  // 3) the real ฝากนำเข้า orders (reforder also holds shop/yuan ids → intersect here)
  type FwdRow = {
    id: number;
    userid: string | null;
    fdate: string | null;
    ftrackingchn: string | null;
    fcabinetnumber: string | null;
    fwarehousechina: string | null;
    ftransporttype: string | null;
    fproductstype: string | null;
    fweight: string | number | null;
    fvolume: string | number | null;
    ftotalprice: string | number | null;
    fdiscount: string | number | null;
  };
  const forwarders: FwdRow[] = [];
  for (const grp of chunk(numericOrderIds, 300)) {
    const res = await admin
      .from("tb_forwarder")
      .select(
        "id, userid, fdate, ftrackingchn, fcabinetnumber, fwarehousechina, ftransporttype, fproductstype, fweight, fvolume, ftotalprice, fdiscount",
      )
      .in("id", grp);
    if (res.error) {
      logger.warn(SCOPE, "forwarder read failed", { reason: res.error.message });
      continue;
    }
    forwarders.push(...((res.data ?? []) as FwdRow[]));
  }

  const rows: CommissionRow[] = [];
  const totals = { weight: 0, cbm: 0, price: 0, discount: 0, count: 0 };
  for (const f of forwarders) {
    const key = String(f.id);
    // legacy join gate: the paying userid must equal the order's userid
    if (walletUserByOrder.get(key) !== (f.userid ?? "")) continue;
    const weight = num(f.fweight);
    const cbm = num(f.fvolume);
    const price = num(f.ftotalprice);
    const discount = num(f.fdiscount);
    const mode = resolveTransportMode(f.fcabinetnumber, f.ftransporttype);
    rows.push({
      paidDate: payDateByOrder.get(key) ?? null,
      createdDate: f.fdate,
      orderId: f.id,
      tracking: f.ftrackingchn ?? "",
      cabinet: f.fcabinetnumber ?? "",
      warehouseLabel: WAREHOUSE_LABEL[(f.fwarehousechina ?? "").trim()] ?? "-",
      transportMode: mode,
      transportLabel: TRANSPORT_LABEL[mode] ?? "-",
      productLabel: PRODUCT_LABEL[(f.fproductstype ?? "").trim()] ?? "ทั่วไป",
      weight,
      cbm,
      price,
      discount,
      memberCode: f.userid ?? "",
      customerName: nameByUser.get(f.userid ?? "") ?? "",
      walletHsId: walletIdByOrder.get(key) ?? null,
    });
    totals.weight += weight;
    totals.cbm += cbm;
    totals.price += price;
    totals.discount += discount;
    totals.count += 1;
  }

  // เรียงทั้ง dataset ก่อน paginate (กดหัวคอลัมน์ ?sort=&dir=) · default paidDate asc · tiebreak orderId
  sortRows(rows, pickSortKey<CommissionRow>(opts.sort, COMMISSION_SORT_KEYS, "paidDate"), normalizeDir(opts.dir), "orderId");
  // แบ่งหน้า COMMISSION_PAGE_SIZE แถว/หน้า · totals (แถบรวม) + totals.count ยังคิดทั้งหมดเสมอ
  // walletHsId ผูกไว้ตั้งแต่ตอน map row แล้ว → ตารางลิงก์ /admin/wallet/[id] (ดูสลิป)
  const page = Math.max(1, opts.page ?? 1);
  const start = (page - 1) * COMMISSION_PAGE_SIZE;
  return {
    rows: rows.slice(start, start + COMMISSION_PAGE_SIZE),
    totals,
    rangeStart: dateFrom,
    rangeEnd: dateTo,
  };
}
