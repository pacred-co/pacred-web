/**
 * Driver work per-STOP report (ปอน 2026-07-29) — ตำแหน่ง "คนขับรถ".
 *
 * ขับจาก batch จัดส่ง `tb_forwarder_driver` (fddate=วันที่มอบงาน · fdadminid=คนขับ ·
 * fdadmincreator=ผู้มอบงาน · endtime=กำหนดเวลา) → items `tb_forwarder_driver_item`
 * (1 แถว/จุดส่ง · fdicompletedat=เวลาที่ไปส่ง · fdinote=หมายเหตุ · fdistatus=สถานะ) →
 * `tb_forwarder` (แทรกกิ้ง/กล่อง/น้ำหนัก/ปริมาตร/ที่อยู่/ขนส่ง). กรองช่วงตาม fddate.
 *
 * คนขับ = admins.role='driver' (ผูก member_code AD เช่น AD020 admin Ben). เอา ปอนด์
 * (admin_pond = owner ทดสอบ) ออก. ใช้เวลาทำงาน(นาที) = fdicompletedat − fddate.
 * คอลัมน์ตามภาพ owner (report-driver): วันที่มอบงาน·เลขที่รายการ·ผู้มอบงาน·คนขับรถ·
 * แทรกกิ้ง·กล่อง·น้ำหนัก·ปริมาตร·สถานที่ไปส่ง·บริษัทขนส่ง·กำหนดเวลา·เวลาที่ไปส่ง·ใช้เวลา·สถานะ·หมายเหตุ.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { COMMISSION_PAGE_SIZE } from "./sales-commission-report";
import { sortRows, pickSortKey, normalizeDir } from "./report-sort";

const SCOPE = "driver-work-report";

/** ปอนด์ = admin_pond = owner (batch ทดสอบ) — ไม่นับเป็นคนขับในรายงาน. */
const EXCLUDED_DRIVERS = new Set(["admin_pond"]);

const FDISTATUS_LABEL: Record<string, string> = {
  "": "ยังไม่ขึ้นรถ",
  "1": "กำลังส่ง",
  "2": "ส่งสำเร็จ",
  "3": "ส่งไม่ได้",
};

// nameShipBy() — legacy pcs-admin/include/function.php (ชุดที่พบบ่อยในรอบส่งในไทย) + fallback.
const SHIP_BY_LABEL: Record<string, string> = {
  PCS: "รับเองโกดัง Pacred", PCSE: "PRE Express", PCSF: "PRF เหมาๆ", F: "บริษัทจัดหาให้อัตโนมัติ",
  "1": "DHL Express", "2": "Flash Express", "3": "J.K. เอ็กซ์เพรส", "4": "Kerry Express",
  "5": "Nim Express", "8": "SCG Express", "11": "ไปรษณีย์ไทย", "21": "นิ่มซี่เส็งขนส่ง 1988", "24": "J&T Express",
};
const shipByLabel = (code: string | null): string => {
  const c = (code ?? "").trim();
  return SHIP_BY_LABEL[c] ?? (c || "ไม่ระบุขนส่ง");
};

export type DriverWorkRow = {
  assignDate: string | null; // วันที่มอบงาน (batch.fddate)
  orderId: number; // เลขที่รายการ (tb_forwarder.id)
  assignerName: string; // ผู้มอบงาน (fdadmincreator → ชื่อ)
  driverName: string; // คนขับรถ (fdadminid → ชื่อ)
  tracking: string; // แทรกกิ้ง
  boxes: number; // กล่อง (famount)
  weight: number; // น้ำหนัก kg
  cbm: number; // ปริมาตร CBM
  deliverTo: string; // สถานที่ไปส่ง
  carrierLabel: string; // บริษัทขนส่ง
  deadline: string | null; // กำหนดเวลา (endtime)
  deliveredAt: string | null; // เวลาที่ไปส่ง (item.fdicompletedat)
  durationMin: number | null; // ใช้เวลาทำงาน (นาที) = deliveredAt − assignDate
  statusCode: string; // สถานะ (fdistatus)
  statusLabel: string;
  note: string; // หมายเหตุ (fdinote)
};

/** สรุปต่อคนขับ (ตารางเหนือรายการ · report-driver summary). */
export type DriverSummaryRow = {
  code: string; // คนขับรถ (fdadminid)
  name: string; // ชื่อ - นามสกุล
  stops: number; // จำนวนจุดที่ส่ง (distinct ปลายทาง)
  tracks: number; // จำนวนแทรคครั้ง (จำนวนรายการจัดส่ง)
  boxes: number; // จำนวนกล่อง
  weight: number; // น้ำหนัก kg
  cbm: number; // ปริมาตร CBM
};

export type DriverWorkReport = {
  rows: DriverWorkRow[];
  summary: DriverSummaryRow[]; // สรุปต่อคนขับ (คิดจากทั้ง dataset · เหนือตาราง)
  totals: { boxes: number; weight: number; cbm: number; count: number };
  rangeStart: string;
  rangeEnd: string;
};

const EMPTY = (start: string, end: string): DriverWorkReport => ({
  rows: [],
  summary: [],
  totals: { boxes: 0, weight: 0, cbm: 0, count: 0 },
  rangeStart: start,
  rangeEnd: end,
});

/** คอลัมน์ที่กดเรียงได้ (หัวตาราง SortHeader) */
const DRIVER_SORT_KEYS: readonly (keyof DriverWorkRow)[] = [
  "assignDate", "orderId", "assignerName", "driverName", "tracking", "boxes",
  "weight", "cbm", "deliverTo", "carrierLabel", "deadline", "deliveredAt",
  "durationMin", "statusCode",
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

/** member_code (AD/PR) หรือ profiles.id (uuid fallback) → ชื่อจริง. */
async function resolveNames(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(ids.map((s) => (s ?? "").trim()).filter(Boolean))];
  if (clean.length === 0) return out;
  const isUuid = (s: string) => s.includes("-") && s.length >= 32;
  const codes = clean.filter((s) => !isUuid(s));
  const uuids = clean.filter(isUuid);
  const full = (fn: string | null, ln: string | null) => `${fn ?? ""} ${ln ?? ""}`.trim();
  for (const grp of chunk(codes, 300)) {
    const { data, error } = await admin.from("profiles").select("member_code, first_name, last_name").in("member_code", grp);
    if (error) { logger.warn(SCOPE, "name by member_code failed", { reason: error.message }); continue; }
    for (const p of (data ?? []) as { member_code: string; first_name: string | null; last_name: string | null }[]) {
      if (p.member_code) out.set(p.member_code, full(p.first_name, p.last_name) || p.member_code);
    }
  }
  for (const grp of chunk(uuids, 300)) {
    const { data, error } = await admin.from("profiles").select("id, first_name, last_name").in("id", grp);
    if (error) { logger.warn(SCOPE, "name by id failed", { reason: error.message }); continue; }
    for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
      out.set(p.id, full(p.first_name, p.last_name) || p.id);
    }
  }
  return out;
}

function composeAddress(f: {
  faddressno: string | null; faddresssubdistrict: string | null;
  faddressdistrict: string | null; faddressprovince: string | null; faddresszipcode: string | null;
}): string {
  const parts = [
    f.faddressno,
    f.faddresssubdistrict ? `ต.${f.faddresssubdistrict}` : "",
    f.faddressdistrict ? `อ.${f.faddressdistrict}` : "",
    f.faddressprovince ? `จ.${f.faddressprovince}` : "",
    f.faddresszipcode,
  ].map((s) => (s ?? "").trim()).filter(Boolean);
  return parts.join(" ") || "-";
}

export async function getDriverWorkReport(opts: {
  repId: string; // ว่าง = ทั้งหมด (ทุกคนขับ ยกเว้นปอนด์)
  dateFrom: string; // YYYY-MM-DD (inclusive · กรองตาม fddate = วันที่มอบงาน)
  dateTo: string; // YYYY-MM-DD (inclusive)
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<DriverWorkReport> {
  const { repId, dateFrom, dateTo } = opts;
  const endExclusive = addOneDay(dateTo);
  const admin = createAdminClient();

  // 1) batch จัดส่งในช่วง (fddate) ของคนขับ (fdadminid · เอาปอนด์ออก)
  type BatchRow = {
    id: number; fddate: string | null; fdadminid: string | null;
    fdadmincreator: string | null; endtime: string | null;
  };
  const batches = await pageAll<BatchRow>(async (from, to) => {
    let q = admin
      .from("tb_forwarder_driver")
      .select("id, fddate, fdadminid, fdadmincreator, endtime")
      .gte("fddate", dateFrom)
      .lt("fddate", endExclusive);
    q = repId
      ? q.eq("fdadminid", repId)
      : q.neq("fdadminid", "").neq("fdadminid", "admin_pond");
    const res = await q.range(from, to);
    return { data: res.data as BatchRow[] | null, error: res.error };
  });
  const batchById = new Map<number, BatchRow>();
  for (const b of batches) {
    if (EXCLUDED_DRIVERS.has((b.fdadminid ?? "").trim())) continue;
    batchById.set(b.id, b);
  }
  if (batchById.size === 0) return EMPTY(dateFrom, dateTo);

  // 2) จุดส่ง (items) ของ batch เหล่านี้
  type ItemRow = {
    id: number; fdid: number; fid: number; fdistatus: string | null;
    fdicompletedat: string | null; fdinote: string | null;
  };
  const batchIds = [...batchById.keys()];
  const items: ItemRow[] = [];
  for (const grp of chunk(batchIds, 300)) {
    const part = await pageAll<ItemRow>(async (from, to) => {
      const res = await admin
        .from("tb_forwarder_driver_item")
        .select("id, fdid, fid, fdistatus, fdicompletedat, fdinote")
        .in("fdid", grp)
        .range(from, to);
      return { data: res.data as ItemRow[] | null, error: res.error };
    });
    items.push(...part);
  }
  if (items.length === 0) return EMPTY(dateFrom, dateTo);

  // 3) tb_forwarder ของแต่ละจุดส่ง (แทรกกิ้ง/กล่อง/น้ำหนัก/ปริมาตร/ที่อยู่/ขนส่ง)
  type FwdRow = {
    id: number; ftrackingchn: string | null; fshipby: string | null;
    famount: number | null; fweight: string | number | null; fvolume: string | number | null;
    faddressno: string | null; faddresssubdistrict: string | null; faddressdistrict: string | null;
    faddressprovince: string | null; faddresszipcode: string | null;
  };
  const fwdById = new Map<number, FwdRow>();
  const fids = [...new Set(items.map((it) => it.fid))];
  for (const grp of chunk(fids, 300)) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(
        "id, ftrackingchn, fshipby, famount, fweight, fvolume, " +
          "faddressno, faddresssubdistrict, faddressdistrict, faddressprovince, faddresszipcode",
      )
      .in("id", grp);
    if (error) { logger.warn(SCOPE, "forwarder read failed", { reason: error.message }); continue; }
    for (const f of (data ?? []) as unknown as FwdRow[]) fwdById.set(f.id, f);
  }

  // 3b) เฉพาะออเดอร์ที่ลูกค้าจ่ายแล้ว (settled `tb_wallet_hs` status='2' · reforder=forwarder id)
  //     — เหมือนรายงานเซลล์/สั่งซื้อ (owner: "เอาเฉพาะที่ลูกค้าจ่ายตังแล้วมีสลิป").
  const paidFids = new Set<number>();
  for (const grp of chunk(fids, 300)) {
    const part = await pageAll<{ reforder: string | null }>(async (from, to) => {
      const res = await admin
        .from("tb_wallet_hs")
        .select("reforder")
        .eq("status", "2")
        .in("reforder", grp.map(String))
        .range(from, to);
      return { data: res.data as { reforder: string | null }[] | null, error: res.error };
    });
    for (const w of part) {
      const n = Number((w.reforder ?? "").trim());
      if (Number.isFinite(n)) paidFids.add(n);
    }
  }
  if (paidFids.size === 0) return EMPTY(dateFrom, dateTo);

  // 4) ชื่อคนขับ + ผู้มอบงาน (member_code AD/PR หรือ uuid)
  const nameIds: string[] = [];
  for (const b of batchById.values()) {
    if (b.fdadminid) nameIds.push(b.fdadminid);
    if (b.fdadmincreator) nameIds.push(b.fdadmincreator);
  }
  const nameById = await resolveNames(admin, nameIds);
  const nameOf = (id: string | null): string => {
    const k = (id ?? "").trim();
    return k ? (nameById.get(k) ?? k) : "-";
  };

  // 5) แถว (1 แถว/จุดส่ง)
  const rows: DriverWorkRow[] = [];
  const totals = { boxes: 0, weight: 0, cbm: 0, count: 0 };
  const summaryByCode = new Map<
    string,
    { code: string; name: string; stops: Set<string>; tracks: number; boxes: number; weight: number; cbm: number }
  >();
  for (const it of items) {
    const b = batchById.get(it.fdid);
    if (!b) continue;
    // นับเฉพาะงานที่ "ส่งสำเร็จ" (fdistatus='2') — owner 2026-07-29: ไม่นับงานที่ส่งไม่ได้
    const statusCode = (it.fdistatus ?? "").trim();
    if (statusCode !== "2") continue;
    if (!paidFids.has(it.fid)) continue; // เฉพาะออเดอร์ที่ลูกค้าจ่ายแล้ว (settled · มีสลิป · เหมือนรายงานอื่น)
    const f = fwdById.get(it.fid);
    // "รับเองโกดัง Pacred" (fshipby='PCS') ไม่นับ — ลูกค้ามารับเอง คนขับไม่ได้ไปส่ง (owner 2026-07-29)
    if ((f?.fshipby ?? "").trim() === "PCS") continue;
    const boxes = num(f?.famount ?? 0);
    const weight = num(f?.fweight ?? 0);
    const cbm = num(f?.fvolume ?? 0);
    const assignDate = b.fddate;
    const deliveredAt = it.fdicompletedat;
    let durationMin: number | null = null;
    if (assignDate && deliveredAt) {
      const ms = new Date(deliveredAt).getTime() - new Date(assignDate).getTime();
      if (Number.isFinite(ms)) durationMin = Math.round(ms / 60000);
    }
    const deliverTo = f ? composeAddress(f) : "-";
    const driverName = nameOf(b.fdadminid);
    rows.push({
      assignDate,
      orderId: it.fid,
      assignerName: nameOf(b.fdadmincreator),
      driverName,
      tracking: f?.ftrackingchn ?? "",
      boxes,
      weight,
      cbm,
      deliverTo,
      carrierLabel: shipByLabel(f?.fshipby ?? null),
      deadline: b.endtime,
      deliveredAt,
      durationMin,
      statusCode,
      statusLabel: FDISTATUS_LABEL[statusCode] ?? (statusCode || "-"),
      note: it.fdinote ?? "",
    });
    totals.boxes += boxes;
    totals.weight += weight;
    totals.cbm += cbm;
    totals.count += 1;
    // สรุปต่อคนขับ (distinct ปลายทาง = จำนวนจุดที่ส่ง · จำนวนรายการ = จำนวนแทรคครั้ง)
    const code = (b.fdadminid ?? "").trim() || "-";
    const s =
      summaryByCode.get(code) ??
      { code, name: driverName, stops: new Set<string>(), tracks: 0, boxes: 0, weight: 0, cbm: 0 };
    s.stops.add(deliverTo);
    s.tracks += 1;
    s.boxes += boxes;
    s.weight += weight;
    s.cbm += cbm;
    summaryByCode.set(code, s);
  }
  const summary: DriverSummaryRow[] = [...summaryByCode.values()]
    .map((s) => ({ code: s.code, name: s.name, stops: s.stops.size, tracks: s.tracks, boxes: s.boxes, weight: s.weight, cbm: s.cbm }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // เรียงทั้ง dataset ก่อน paginate (default assignDate asc · tiebreak orderId)
  sortRows(rows, pickSortKey<DriverWorkRow>(opts.sort, DRIVER_SORT_KEYS, "assignDate"), normalizeDir(opts.dir), "orderId");
  const page = Math.max(1, opts.page ?? 1);
  const start = (page - 1) * COMMISSION_PAGE_SIZE;
  return {
    rows: rows.slice(start, start + COMMISSION_PAGE_SIZE),
    summary,
    totals,
    rangeStart: dateFrom,
    rangeEnd: dateTo,
  };
}
