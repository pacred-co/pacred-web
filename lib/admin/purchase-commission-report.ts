/**
 * Purchase-commission per-ORDER report (ปอน 2026-07-29) — ตำแหน่ง "สั่งซื้อ" = ฝากสั่งซื้อ.
 *
 * ขับจาก SHOP order (tb_header_order) · attribute per-ORDER ด้วย tb_header_order.adminidpurchaser
 * (mig 0241 · = tb_admin.adminID หรือ profiles.id ตัดสั้น 20 ตัวสำหรับ modern admin). เอาเฉพาะ
 * "งานที่ลูกค้าจ่ายแล้ว" (tb_wallet_hs settled · typeservice='1' · status='2') · นับเป็นเดือนที่จ่าย.
 *
 * เอา ปอนด์ (admin_pond = ชูเกียรติ/owner) ออกจากรายงาน (owner สั่ง). คอลัมน์ตามภาพ +
 * สลิป (walletHsId → /admin/wallet/[id]) ให้ตรวจว่าจ่ายจริง. % (ค่าคอม) ยังไม่คำนวณ = null.
 * เงิน (owner 2026-07-29): COST=ราคารวมหยวนจีน (htotalpricechn+hshippingchn) · DISCOUNT=ราคาซื้อจริง
 * (hcostall · ¥ actually paid) · DIFFERANCE=COST−DISCOUNT (ส่วนต่างที่ต่อได้ = ฐานค่าคอม) · EX=hratecost ·
 * TOTAL(฿)=DIFFERANCE×EX (ส่วนต่างเป็นบาท). ชื่อ modern (เบญจพร=มะนาว) resolve จาก profiles.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { COMMISSION_PAGE_SIZE } from "./sales-commission-report";
import { sortRows, pickSortKey, normalizeDir } from "./report-sort";
import { resolveModernAdminNames } from "./sales-roster";

const SCOPE = "purchase-commission-report";

/** ปอนด์ = admin_pond = ชูเกียรติ (owner) — ไม่นับเป็นผู้สั่งซื้อในรายงาน. */
const EXCLUDED_PURCHASERS = new Set(["admin_pond"]);

const HSTATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "40": "ถึงโกดังจีน",
  "5": "สำเร็จ",
  "6": "ยกเลิก",
};

export type PurchaseCommissionRow = {
  paidDate: string | null; // วันที่ชำระเงิน (tb_wallet_hs.date)
  createdDate: string | null; // วันที่สร้าง (tb_header_order.hdate)
  memberCode: string; // รหัสสมาชิก (userid)
  orderNo: string; // เลขที่ออเดอร์ (hno)
  purchaserName: string; // แอดมินสั่งจีน (adminidpurchaser → tb_admin/profiles)
  costYuan: number; // COST (YUAN) = htotalpricechn + hshippingchn (ราคารวมหยวนจีน)
  discountYuan: number; // DISCOUNT (YUAN) = hcostall (ราคาซื้อจริง · ¥ actually paid)
  diffYuan: number; // DIFFERANCE (YAUN) = COST − DISCOUNT (ส่วนต่างที่ต่อได้ · ฐานค่าคอม)
  ex: number; // EX = hratecost (อัตราแลกเปลี่ยนจริง)
  commissionPct: number | null; // % — null = ยังไม่คำนวณ ("—")
  totalBaht: number; // TOTAL (BAHT) = DIFFERANCE × EX (ส่วนต่างเป็นบาท)
  statusLabel: string; // สถานะออเดอร์
  statusCode: string;
  walletHsId: number | null; // สลิป → /admin/wallet/[id]
};

export type PurchaseCommissionReport = {
  rows: PurchaseCommissionRow[];
  totals: { costYuan: number; totalBaht: number; count: number };
  rangeStart: string;
  rangeEnd: string;
};

/** คอลัมน์ที่กดเรียงได้ (ตรงกับ field ของ PurchaseCommissionRow · หัวตาราง SortHeader) */
const PURCHASE_SORT_KEYS: readonly (keyof PurchaseCommissionRow)[] = [
  "paidDate", "createdDate", "memberCode", "orderNo", "purchaserName", "costYuan",
  "discountYuan", "diffYuan", "ex", "commissionPct", "totalBaht", "statusCode",
];

const EMPTY = (start: string, end: string): PurchaseCommissionReport => ({
  rows: [],
  totals: { costYuan: 0, totalBaht: 0, count: 0 },
  rangeStart: start,
  rangeEnd: end,
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

/** "2026-07-31" → "2026-08-01" (upper bound exclusive · UTC). */
function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const num = (v: string | number | null): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

export async function getPurchaseCommissionReport(opts: {
  repId: string; // ว่าง = ทั้งหมด (ทุกผู้สั่งซื้อ ยกเว้นปอนด์)
  dateFrom: string; // YYYY-MM-DD (inclusive)
  dateTo: string; // YYYY-MM-DD (inclusive)
  page?: number;
  sort?: string; // คอลัมน์ที่เรียง (keyof PurchaseCommissionRow · default paidDate)
  dir?: string; // asc | desc (default asc)
}): Promise<PurchaseCommissionReport> {
  const { repId, dateFrom, dateTo } = opts;
  const startInclusive = dateFrom;
  const endExclusive = addOneDay(dateTo);
  const admin = createAdminClient();

  // 1) ออเดอร์ฝากสั่งซื้อของผู้สั่งซื้อ (attribute = tb_header_order.adminidpurchaser · เอาปอนด์ออก)
  type OrderRow = {
    hno: string;
    userid: string | null;
    hdate: string | null;
    hstatus: string | null;
    htotalpricechn: string | number | null; // ราคาสินค้า ¥ (Σ cprice×qty)
    hshippingchn: string | number | null;   // ค่าส่งในจีน ¥
    hcostall: string | number | null;        // ราคาซื้อจริง ¥ (actually paid หลัง pricing ต่อ) = DISCOUNT
    hratecost: string | number | null;       // อัตราแลกเปลี่ยนจริง (cost FX) = EX
    adminidpurchaser: string | null;
  };
  const orders = await pageAll<OrderRow>(async (from, to) => {
    let q = admin
      .from("tb_header_order")
      .select("hno, userid, hdate, hstatus, htotalpricechn, hshippingchn, hcostall, hratecost, adminidpurchaser");
    q = repId
      ? q.eq("adminidpurchaser", repId)
      : q.neq("adminidpurchaser", "").neq("adminidpurchaser", "admin_pond");
    const res = await q.range(from, to);
    return { data: res.data as OrderRow[] | null, error: res.error };
  });
  if (orders.length === 0) return EMPTY(dateFrom, dateTo);

  const orderByHno = new Map<string, OrderRow>();
  const purchaserIds = new Set<string>();
  for (const o of orders) {
    const hno = (o.hno ?? "").trim();
    const pid = (o.adminidpurchaser ?? "").trim();
    if (!hno || EXCLUDED_PURCHASERS.has(pid)) continue;
    orderByHno.set(hno, o);
    if (pid) purchaserIds.add(pid);
  }
  const hnos = [...orderByHno.keys()];
  if (hnos.length === 0) return EMPTY(dateFrom, dateTo);

  // 2) เฉพาะงานที่ลูกค้าจ่ายแล้ว: tb_wallet_hs (typeservice='1' shop · status='2') ในช่วงวันที่
  type WalletRow = { id: number; reforder: string | null; date: string | null };
  const payByHno = new Map<string, { date: string; walletId: number }>();
  for (const grp of chunk(hnos, 300)) {
    const part = await pageAll<WalletRow>(async (from, to) => {
      const res = await admin
        .from("tb_wallet_hs")
        .select("id, reforder, date")
        .eq("status", "2")
        .eq("typeservice", "1")
        .in("reforder", grp)
        .gte("date", startInclusive)
        .lt("date", endExclusive)
        .range(from, to);
      return { data: res.data as WalletRow[] | null, error: res.error };
    });
    for (const w of part) {
      const ref = (w.reforder ?? "").trim();
      if (!ref || !w.date) continue;
      const prev = payByHno.get(ref);
      if (!prev || w.date > prev.date) payByHno.set(ref, { date: w.date, walletId: w.id });
    }
  }
  if (payByHno.size === 0) return EMPTY(dateFrom, dateTo);

  // 3) ชื่อผู้สั่งซื้อ: tb_admin (legacy · admin_web) → profiles (modern · id ตัดสั้น เช่น เบญจพร/มะนาว)
  const nameByPurchaser = new Map<string, string>();
  for (const grp of chunk([...purchaserIds], 300)) {
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname")
      .in("adminID", grp);
    if (error) {
      logger.warn(SCOPE, "purchaser tb_admin lookup failed", { reason: error.message });
      continue;
    }
    for (const a of (data ?? []) as {
      adminID: string;
      adminName: string | null;
      adminLastName: string | null;
      adminNickname: string | null;
    }[]) {
      const full = `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim();
      nameByPurchaser.set(a.adminID, (a.adminNickname ?? "").trim() || full || a.adminID);
    }
  }
  // modern admin — adminidpurchaser = profiles.id ตัดสั้น 20 ตัว (uuid → prefix-match ใน JS)
  const modernNames = await resolveModernAdminNames([...purchaserIds].filter((p) => !nameByPurchaser.has(p)));
  for (const [id, name] of modernNames) nameByPurchaser.set(id, name);

  // 4) แถว (1 แถว/ออเดอร์ที่จ่ายแล้ว · bucket ตามวันจ่าย)
  const rows: PurchaseCommissionRow[] = [];
  const totals = { costYuan: 0, totalBaht: 0, count: 0 };
  for (const [hno, pay] of payByHno) {
    const o = orderByHno.get(hno);
    if (!o) continue;
    // owner 2026-07-29 (ยืนยันจากหน้า report จริง):
    //   COST       = ราคารวมหยวนจีน = ราคาสินค้า + ค่าส่งในจีน (htotalpricechn + hshippingchn)
    //   DISCOUNT   = ราคาซื้อจริง = ยอดที่สั่งซื้อจริง (hcostall · ¥ actually paid หลัง pricing ต่อ)
    //   DIFFERANCE = ส่วนต่างที่ต่อได้ = COST − DISCOUNT  →  cost − discount = diff ✓ (ฐานคิดค่าคอม)
    //   EX         = อัตราแลกเปลี่ยนจริง (hratecost · ไม่ใช่ hrate ฝั่งขาย)
    //   TOTAL(฿)   = ส่วนต่างเป็นบาท = DIFFERANCE × EX (total diff แปลงเป็นบาท)
    const costYuan = num(o.htotalpricechn) + num(o.hshippingchn);
    const actualYuan = num(o.hcostall);
    const discountYuan = actualYuan > 0 ? actualYuan : costYuan; // hcostall ว่าง → ถือว่าจ่ายเต็มราคาร้าน
    const diffYuan = costYuan - discountYuan; // ส่วนต่างที่ต่อได้ · cost − discount = diff
    const ex = num(o.hratecost);
    const totalBaht = diffYuan * ex; // ส่วนต่างเป็นบาท (total diff)
    const statusCode = (o.hstatus ?? "").trim();
    const pid = (o.adminidpurchaser ?? "").trim();
    rows.push({
      paidDate: pay.date,
      createdDate: o.hdate,
      memberCode: o.userid ?? "",
      orderNo: hno,
      purchaserName: nameByPurchaser.get(pid) ?? pid,
      costYuan,
      discountYuan,
      diffYuan,
      ex,
      commissionPct: null,
      totalBaht,
      statusLabel: HSTATUS_LABEL[statusCode] ?? (statusCode || "-"),
      statusCode,
      walletHsId: pay.walletId,
    });
    totals.costYuan += costYuan;
    totals.totalBaht += totalBaht;
    totals.count += 1;
  }

  // เรียงทั้ง dataset ก่อน paginate (กดหัวคอลัมน์ ?sort=&dir=) · default paidDate asc · tiebreak orderNo
  sortRows(rows, pickSortKey<PurchaseCommissionRow>(opts.sort, PURCHASE_SORT_KEYS, "paidDate"), normalizeDir(opts.dir), "orderNo");
  const page = Math.max(1, opts.page ?? 1);
  const start = (page - 1) * COMMISSION_PAGE_SIZE;
  return {
    rows: rows.slice(start, start + COMMISSION_PAGE_SIZE),
    totals,
    rangeStart: dateFrom,
    rangeEnd: dateTo,
  };
}
