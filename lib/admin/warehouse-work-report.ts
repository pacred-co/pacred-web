/**
 * Warehouse work per-ITEM report (ปอน 2026-07-29) — ตำแหน่ง "โกดังคลังสินค้า".
 *
 * owner: "ตารางข้อมูล = ของที่ยิง(รับเข้าไทย)แล้ว + ลูกค้าจ่ายแล้ว · จัดหัวคอลัมเอง ·
 * คอลัมน์หลักต้องมี CBM/kg/tracking/จำนวน + สลิป". ขับจาก `tb_forwarder` ที่ถึงไทยแล้ว
 * (fstatus 4-7 · มี fdatestatus4 = วันที่ยิงเข้าไทย) + settled (tb_wallet_hs status='2').
 *
 * ⚠️ attribution: `warehouse_intake_log` (log "ใครยิง") ยัง 0 แถว (หน้ายิงรับเข้าไทย
 * ยังไม่เปิดใช้) → ใช้ **tb_forwarder.adminidupdate** (คนล่าสุดที่ประมวลผลรายการ) เป็น
 * ผู้รับผิดชอบแทน (ตัด system sys-* ออก) · พอเปิดหน้ายิงจริงค่อยเปลี่ยนมาใช้ log. ปน 2 ระบบ
 * (legacy admin_* + modern profiles.id ตัดสั้น เช่น กีตาร์=AD021=4334709e-…) → resolve เหมือน purchaser.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { COMMISSION_PAGE_SIZE } from "./sales-commission-report";
import { sortRows, pickSortKey, normalizeDir } from "./report-sort";
import { resolveModernAdminNames } from "./sales-roster";

const SCOPE = "warehouse-work-report";

/** system/owner ids ที่ไม่นับเป็น "ผู้รับผิดชอบ" ในตัวกรอง (แต่ "ทั้งหมด" ยังแสดงของเขา). */
export const isSystemHandler = (id: string): boolean =>
  id.startsWith("sys-") || id === "admin_pond" || id === "system" || id === "";

const FSTATUS_LABEL: Record<string, string> = {
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};
const WAREHOUSE_LABEL: Record<string, string> = { "1": "กวางโจว", "2": "อี้อู" };

export type WarehouseWorkRow = {
  arriveDate: string | null; // วันที่ยิงเข้าไทย (fdatestatus4)
  orderId: number; // เลขที่รายการ (tb_forwarder.id)
  memberCode: string; // รหัสสมาชิก (userid)
  handlerName: string; // ผู้รับผิดชอบ (adminidupdate resolved)
  tracking: string; // แทรกกิ้ง
  boxes: number; // จำนวน (famount)
  weight: number; // น้ำหนัก kg
  cbm: number; // ปริมาตร CBM
  cabinet: string; // เลขตู้
  warehouseLabel: string; // โกดังจีน
  statusCode: string; // สถานะ
  statusLabel: string;
  walletHsId: number | null; // สลิป → /admin/wallet/[id]
};

export type WarehouseWorkReport = {
  rows: WarehouseWorkRow[];
  totals: { boxes: number; weight: number; cbm: number; count: number };
  rangeStart: string;
  rangeEnd: string;
};

const EMPTY = (start: string, end: string): WarehouseWorkReport => ({
  rows: [],
  totals: { boxes: 0, weight: 0, cbm: 0, count: 0 },
  rangeStart: start,
  rangeEnd: end,
});

/** คอลัมน์ที่กดเรียงได้ (หัวตาราง SortHeader) */
const WAREHOUSE_SORT_KEYS: readonly (keyof WarehouseWorkRow)[] = [
  "arriveDate", "orderId", "memberCode", "handlerName", "tracking", "boxes",
  "weight", "cbm", "cabinet", "warehouseLabel", "statusCode",
];

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
    if (error) { logger.warn(SCOPE, "read failed", { reason: error.message }); break; }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const num = (v: string | number | null): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/** adminidupdate → ชื่อ: legacy admin_* (tb_admin) · modern id ตัดสั้น (resolveModernAdminNames) · sys-* = ระบบ. */
async function resolveHandlerNames(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(ids.map((s) => (s ?? "").trim()).filter(Boolean))];
  for (const id of clean) {
    if (id.startsWith("sys-") || id === "system") out.set(id, "ระบบ");
    else if (id === "admin_pond") out.set(id, "ปอนด์");
  }
  const wanted = clean.filter((id) => !out.has(id));
  // legacy tb_admin (admin_aom ฯลฯ)
  const legacy = wanted.filter((id) => !id.includes("-"));
  for (const grp of chunk(legacy, 300)) {
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminNickname, adminName, adminLastName")
      .in("adminID", grp);
    if (error) { logger.warn(SCOPE, "tb_admin handler lookup failed", { reason: error.message }); continue; }
    for (const a of (data ?? []) as { adminID: string; adminNickname: string | null; adminName: string | null; adminLastName: string | null }[]) {
      const full = `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim();
      out.set(a.adminID, (a.adminNickname ?? "").trim() || full || a.adminID);
    }
  }
  // modern (profiles.id ตัดสั้น เช่น กีตาร์)
  const modern = await resolveModernAdminNames(wanted.filter((id) => id.includes("-") && !out.has(id)));
  for (const [id, name] of modern) out.set(id, name);
  return out;
}

export async function getWarehouseWorkReport(opts: {
  repId: string; // ว่าง = ทั้งหมด (ของถึงไทย+จ่ายแล้วทุกคน) · มีค่า = adminidupdate นั้น
  dateFrom: string; // YYYY-MM-DD (inclusive · กรองตาม fdatestatus4 = วันที่ยิงเข้าไทย)
  dateTo: string; // YYYY-MM-DD (inclusive)
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<WarehouseWorkReport> {
  const { repId, dateFrom, dateTo } = opts;
  const endExclusive = addOneDay(dateTo);
  const admin = createAdminClient();

  // 1) forwarder ที่ถึงไทยแล้ว (fstatus 4-7 · fdatestatus4 ในช่วง = วันที่ยิงเข้าไทย)
  type FwdRow = {
    id: number; userid: string | null; adminidupdate: string | null; fdatestatus4: string | null;
    ftrackingchn: string | null; famount: number | null; fweight: string | number | null;
    fvolume: string | number | null; fcabinetnumber: string | null; fwarehousechina: string | null; fstatus: string | null;
  };
  const arrived = await pageAll<FwdRow>(async (from, to) => {
    let q = admin
      .from("tb_forwarder")
      .select(
        "id, userid, adminidupdate, fdatestatus4, ftrackingchn, famount, fweight, fvolume, fcabinetnumber, fwarehousechina, fstatus",
      )
      .in("fstatus", ["4", "5", "6", "7"])
      .gte("fdatestatus4", dateFrom)
      .lt("fdatestatus4", endExclusive);
    if (repId) q = q.eq("adminidupdate", repId);
    const res = await q.range(from, to);
    return { data: res.data as FwdRow[] | null, error: res.error };
  });
  if (arrived.length === 0) return EMPTY(dateFrom, dateTo);

  // 2) เฉพาะที่ลูกค้าจ่ายแล้ว: tb_wallet_hs settled (status='2' · reforder=forwarder id)
  const fids = arrived.map((f) => f.id);
  const walletByFid = new Map<number, number>(); // fid → wallet id ล่าสุด (สลิป)
  type WalletRow = { id: number; reforder: string | null };
  for (const grp of chunk(fids, 300)) {
    const part = await pageAll<WalletRow>(async (from, to) => {
      const res = await admin
        .from("tb_wallet_hs")
        .select("id, reforder")
        .eq("status", "2")
        .in("reforder", grp.map(String))
        .range(from, to);
      return { data: res.data as WalletRow[] | null, error: res.error };
    });
    for (const w of part) {
      const n = Number((w.reforder ?? "").trim());
      if (!Number.isFinite(n)) continue;
      const prev = walletByFid.get(n);
      if (prev == null || w.id > prev) walletByFid.set(n, w.id); // เก็บ id สูงสุด (ล่าสุด)
    }
  }
  const paid = arrived.filter((f) => walletByFid.has(f.id));
  if (paid.length === 0) return EMPTY(dateFrom, dateTo);

  // 3) ชื่อผู้รับผิดชอบ (adminidupdate)
  const nameByHandler = await resolveHandlerNames(admin, paid.map((f) => f.adminidupdate ?? ""));
  const handlerName = (id: string | null): string => {
    const k = (id ?? "").trim();
    return k ? (nameByHandler.get(k) ?? k) : "-";
  };

  // 4) แถว (1 แถว/รายการที่ถึงไทย+จ่ายแล้ว)
  const rows: WarehouseWorkRow[] = [];
  const totals = { boxes: 0, weight: 0, cbm: 0, count: 0 };
  for (const f of paid) {
    const boxes = num(f.famount);
    const weight = num(f.fweight);
    const cbm = num(f.fvolume);
    const statusCode = (f.fstatus ?? "").trim();
    rows.push({
      arriveDate: f.fdatestatus4,
      orderId: f.id,
      memberCode: f.userid ?? "",
      handlerName: handlerName(f.adminidupdate),
      tracking: f.ftrackingchn ?? "",
      boxes,
      weight,
      cbm,
      cabinet: f.fcabinetnumber ?? "",
      warehouseLabel: WAREHOUSE_LABEL[(f.fwarehousechina ?? "").trim()] ?? "-",
      statusCode,
      statusLabel: FSTATUS_LABEL[statusCode] ?? (statusCode || "-"),
      walletHsId: walletByFid.get(f.id) ?? null,
    });
    totals.boxes += boxes;
    totals.weight += weight;
    totals.cbm += cbm;
    totals.count += 1;
  }

  // เรียงทั้ง dataset ก่อน paginate (default วันที่ยิงเข้าไทย · tiebreak orderId)
  sortRows(rows, pickSortKey<WarehouseWorkRow>(opts.sort, WAREHOUSE_SORT_KEYS, "arriveDate"), normalizeDir(opts.dir), "orderId");
  const page = Math.max(1, opts.page ?? 1);
  const start = (page - 1) * COMMISSION_PAGE_SIZE;
  return {
    rows: rows.slice(start, start + COMMISSION_PAGE_SIZE),
    totals,
    rangeStart: dateFrom,
    rangeEnd: dateTo,
  };
}

/**
 * Warehouse roster (ตำแหน่ง "โกดัง") — distinct tb_forwarder.adminidupdate ของ "ของถึงไทยแล้ว"
 * (fstatus 4-7 · มี fdatestatus4) · ตัด system (sys-*) + ปอนด์ + ว่าง · resolve ชื่อ. คนที่เคย
 * ประมวลผล/ยิงของเข้าไทยจริง (เช่น กีตาร์ AD021 warehouse) จะขึ้น dropdown เอง.
 */
export async function getActiveWarehouseReps(): Promise<{ adminID: string; name: string }[]> {
  const admin = createAdminClient();
  // ของถึงไทยแล้ว (fstatus 4-7 · มี fdatestatus4) → id + adminidupdate
  type Row = { id: number; adminidupdate: string | null };
  const arrived = await pageAll<Row>(async (from, to) => {
    const res = await admin
      .from("tb_forwarder")
      .select("id, adminidupdate")
      .in("fstatus", ["4", "5", "6", "7"])
      .not("fdatestatus4", "is", null)
      .range(from, to);
    return { data: res.data as Row[] | null, error: res.error };
  });
  if (arrived.length === 0) return [];
  // เฉพาะที่ลูกค้าจ่ายแล้ว — คนจะขึ้น dropdown ก็ต่อเมื่อ "มีรายการในรายงานจริง"
  // (owner 2026-07-29: "ต้องมีรายการที่เขาทำ ถึงจะมีชื่อขึ้น ไม่เอาเยอะๆ") → 16 → 5 คน
  const paidFids = new Set<number>();
  for (const grp of chunk(arrived.map((r) => r.id), 300)) {
    const part = await pageAll<{ reforder: string | null }>(async (from, to) => {
      const res = await admin.from("tb_wallet_hs").select("reforder").eq("status", "2").in("reforder", grp.map(String)).range(from, to);
      return { data: res.data as { reforder: string | null }[] | null, error: res.error };
    });
    for (const w of part) {
      const n = Number((w.reforder ?? "").trim());
      if (Number.isFinite(n)) paidFids.add(n);
    }
  }
  const seen = new Set<string>();
  for (const r of arrived) {
    if (!paidFids.has(r.id)) continue;
    const id = (r.adminidupdate ?? "").trim();
    if (id && !isSystemHandler(id)) seen.add(id);
  }
  if (seen.size === 0) return [];
  const names = await resolveHandlerNames(admin, [...seen]);
  return [...seen]
    .map((id) => ({ adminID: id, name: names.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}
