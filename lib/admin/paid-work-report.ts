/**
 * paid-work-report.ts — "งานที่ลูกค้าจ่ายเงินมาแล้ว" รายเดือน (owner 2026-07-30).
 *
 * คนละอันกับ "กำไรตู้ (รายเดือน)" (container-cost-rollup) ที่โชว์ของ "ทั้งตู้" ตามเดือน
 * ของเลขตู้. อันนี้ = งานที่ **ลูกค้าจ่ายเงินมาแล้วจริง** จัดกลุ่มตาม "เดือนที่จ่าย"
 * (owner "จ่ายเดือนไหน นับเดือนนั้น") → reconcile กับรายงานค่าคอมได้.
 *
 * ══ paid-detection = ตัวเดียวกับรายงานค่าคอม (ห้ามคิดใหม่ · ไม่งั้นเลขไม่ตรง) ══
 * "จ่ายแล้ว + เดือนไหน" = การชำระใน tb_wallet_hs ที่ status='2' (settled) และ date อยู่
 * ในเดือนนั้น. reforder ชี้ไปที่ออเดอร์. dedup reforder → วันจ่ายล่าสุด (1 แถว/ออเดอร์).
 * พิสูจน์กับ prod (2026-07-30 · scripts/_pwprobe-paid-work-*.mjs):
 *   • นำเข้า: การจ่ายค่าฝากนำเข้า = HEADER type-1 (reforder ว่าง · ถือสลิป+ยอดรวม) +
 *     CHILD type-4 (reforder = tb_forwarder.id ต่อแถว · typeservice='2'). 1 การจ่ายจึง
 *     ครอบหลายแถว = หลาย CHILD (แถวละ id) → mirror sales-commission-report: จับ reforder
 *     ที่เป็นตัวเลข → tb_forwarder.id (gate userid) → sum ทุกแถว = ครบ ไม่นับซ้ำ (HEADER
 *     reforder ว่าง จึงไม่โดนนับ). prod: 366 settled numeric-ref rows → 365 distinct fid ·
 *     ทุกแถว typeservice='2' · userid==forwarder.userid 366/366 (gate ไม่ทิ้งอะไร).
 *   • สั่งซื้อ: การจ่ายฝากสั่งซื้อ = tb_wallet_hs typeservice='1' status='2' · reforder = hno
 *     (เช่น "P22359") → mirror purchase-commission-report → tb_header_order.
 *   • ฝากโอน (yuan) = ไม่ใช่ "งานขนส่ง" → ตัดออก (owner พูดแค่ สั่งซื้อ + นำเข้า). yuan ไม่มี
 *     numeric reforder ที่ชนกับ tb_forwarder.id และไม่มี typeservice='1' → ตกทั้ง 2 เลน
 *     โดยธรรมชาติ (ไม่ต้องกรองเพิ่ม).
 *
 * ══ นิยามเงิน (ยึด SOT เดิม · ห้ามเขียนสูตรเอง) ══
 *   นำเข้า (tb_forwarder):
 *     ขาย  = ftotalprice (ค่านำเข้าจีน-ไทย · SOT เดียวกับ report-cnt/sales-commission)
 *     ทุน  = fcosttotalprice (ค่าที่เก็บ · เป็นบาทอยู่แล้ว)
 *     คิว  = totalCbmOf (กฎ famountcount · lib/forwarder/quantities.ts)
 *     ขนส่ง = resolveTransportMode(เลขตู้, ftransporttype) — GZE/EK=รถ · GZS/YW*=เรือ
 *     ต้นทาง = fwarehousechina ("1"=กวางโจว · "2"=อี้อู)
 *   สั่งซื้อ (tb_header_order):
 *     ขาย  = htotalpriceuser (บาท · ยอดที่ลูกค้าจ่าย)
 *     ทุน  = hcostall × hratecost — hcostall เก็บเป็น **หยวน** (ราคาซื้อจริงหลังต่อ · เหมือน
 *            ที่ purchase-commission-report ใช้เป็น DISCOUNT[¥]) → ต้อง × เรตต้นทุน (hratecost)
 *            ให้เป็นบาทก่อน ไม่งั้น กำไร = บาท − หยวน (มั่ว · prod July: ¥ literal = margin 80.9%
 *            เพี้ยน · × hratecost = 3.6% สมเหตุผลของธุรกิจฝากซื้อ). ⚠️ ไม่ใช้ hcostall ดิบ.
 *     คิว/ขนส่ง/ต้นทาง = ไม่มี (เป็นมิติของนำเข้า)
 *
 * ทุกกลุ่ม profit = round2(sell − cost). unpriced = แถวที่ ขาย>0 แต่ ทุน=0 (ธงเตือน).
 * READ-ONLY ล้วน · fail-soft (query พังคืนเดือนว่าง ไม่ throw ทำหน้าพัง).
 */
import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { totalCbmOf } from "@/lib/forwarder/quantities";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { logger } from "@/lib/logger";
import {
  aggregatePaidWork,
  transportBucketOf,
  originBucketOf,
  round2,
  type PaidOrderRecord,
  type PaidWorkReport,
} from "./paid-work-report-core";

// re-export public types/report shape (page + table import จากที่นี่)
export type {
  PaidWorkReport,
  PaidWorkMonth,
  PaidMetric,
  ServiceBucket,
  TransportBucket,
  OriginBucket,
} from "./paid-work-report-core";

const SCOPE = "paid-work-report";
type AdminClient = ReturnType<typeof createAdminClient>;

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/** "2026-07-31" → "2026-08-01" (upper bound exclusive · UTC · date เป็น timestamp เก็บ UTC). */
function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** เดือน "YYYY-MM" ของค่า date (timestamp UTC · session UTC → first-7 = boundary month
 *  ที่ commission report ใช้ `>= 'M-01' AND < 'nextM-01'` ⇒ reconcile ตรง). */
function monthOfPayDate(v: string | null): string | null {
  const m = /(\d{4})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[1]}-${m[2]}` : null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const EMPTY = (start: string, end: string): PaidWorkReport => ({
  months: [],
  grand: { orders: 0, cbm: 0, sell: 0, cost: 0, profit: 0, unpricedOrders: 0 },
  rangeStart: start,
  rangeEnd: end,
});

export async function getPaidWorkByMonth(
  admin: AdminClient,
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<PaidWorkReport> {
  const dateFrom = (opts.dateFrom ?? "").trim();
  const dateTo = (opts.dateTo ?? "").trim();
  const endExclusive = dateTo ? addOneDay(dateTo) : "";

  // ── 1) การชำระที่ settle ในช่วง (ครั้งเดียว · split เป็น import/shop ใน JS) ──
  // status='2' + ช่วงวันจ่าย. numeric reforder = CHILD ค่าฝากนำเข้า (fid) · typeservice='1' +
  // reforder ไม่ว่าง = ฝากสั่งซื้อ (hno). HEADER (reforder ว่าง) + yuan → ตกทั้งคู่โดยธรรมชาติ.
  type WalletRow = { id: number; reforder: string | null; userid: string | null; date: string | null; typeservice: string | null };
  const { data: wallet, error: wErr } = await fetchAllRows<WalletRow>(() => {
    let q = admin
      .from("tb_wallet_hs")
      .select("id, reforder, userid, date, typeservice")
      .eq("status", "2");
    if (dateFrom) q = q.gte("date", dateFrom);
    if (endExclusive) q = q.lt("date", endExclusive);
    return q.order("id", { ascending: true });
  });
  if (wErr) {
    logger.warn(SCOPE, "wallet read failed", { reason: wErr.message });
    return EMPTY(dateFrom, dateTo);
  }
  if (wallet.length === 0) return EMPTY(dateFrom, dateTo);

  // dedup reforder → วันจ่ายล่าสุด (1 แถว/ออเดอร์ · legacy GROUP BY)
  // นำเข้า: reforder เป็นตัวเลข = fid → เก็บ userid ผู้จ่าย (gate) + date
  const importPay = new Map<string, { userid: string; date: string }>(); // fid → {userid, date}
  // สั่งซื้อ: typeservice='1' + reforder ไม่ว่าง = hno → date
  const shopPay = new Map<string, string>(); // hno → date
  for (const w of wallet) {
    const ref = (w.reforder ?? "").trim();
    const date = w.date ?? "";
    if (!ref || !date) continue;
    if (/^\d+$/.test(ref)) {
      const prev = importPay.get(ref);
      if (!prev || date > prev.date) importPay.set(ref, { userid: (w.userid ?? "").trim(), date });
    } else if ((w.typeservice ?? "").trim() === "1") {
      const prev = shopPay.get(ref);
      if (!prev || date > prev) shopPay.set(ref, date);
    }
  }

  const records: PaidOrderRecord[] = [];

  // ── 2) นำเข้า: tb_forwarder ตาม fid (gate userid = ผู้จ่าย) ──
  const fids = [...importPay.keys()];
  if (fids.length > 0) {
    type FwdRow = {
      id: number;
      userid: string | null;
      fcabinetnumber: string | null;
      ftransporttype: string | null;
      fwarehousechina: string | null;
      fvolume: number | string | null;
      famount: number | string | null;
      famountcount: number | string | null;
      ftotalprice: number | string | null;
      fcosttotalprice: number | string | null;
    };
    const forwarders: FwdRow[] = [];
    for (const grp of chunk(fids, 300)) {
      const res = await admin
        .from("tb_forwarder")
        .select("id, userid, fcabinetnumber, ftransporttype, fwarehousechina, fvolume, famount, famountcount, ftotalprice, fcosttotalprice")
        .in("id", grp.map(Number));
      if (res.error) {
        logger.warn(SCOPE, "forwarder read failed", { reason: res.error.message });
        continue;
      }
      forwarders.push(...((res.data ?? []) as FwdRow[]));
    }
    for (const f of forwarders) {
      const pay = importPay.get(String(f.id));
      if (!pay) continue;
      // legacy gate: ผู้จ่าย = เจ้าของออเดอร์ (mirror sales-commission)
      if (pay.userid !== (f.userid ?? "").trim()) continue;
      const month = monthOfPayDate(pay.date);
      if (!month) continue;
      const sell = num(f.ftotalprice);
      const cost = num(f.fcosttotalprice);
      const mode = resolveTransportMode(f.fcabinetnumber, f.ftransporttype);
      records.push({
        service: "import",
        month,
        sell,
        cost,
        cbm: totalCbmOf(f),
        transport: transportBucketOf(mode),
        origin: originBucketOf(f.fwarehousechina),
        unpriced: sell > 0 && cost <= 0,
      });
    }
  }

  // ── 3) สั่งซื้อ: tb_header_order ตาม hno ──
  const hnos = [...shopPay.keys()];
  if (hnos.length > 0) {
    type OrderRow = {
      hno: string;
      htotalpriceuser: number | string | null;
      hcostall: number | string | null;
      hratecost: number | string | null;
    };
    const orders: OrderRow[] = [];
    for (const grp of chunk(hnos, 300)) {
      const res = await admin
        .from("tb_header_order")
        .select("hno, htotalpriceuser, hcostall, hratecost")
        .in("hno", grp);
      if (res.error) {
        logger.warn(SCOPE, "header_order read failed", { reason: res.error.message });
        continue;
      }
      orders.push(...((res.data ?? []) as OrderRow[]));
    }
    for (const o of orders) {
      const date = shopPay.get((o.hno ?? "").trim());
      if (!date) continue;
      const month = monthOfPayDate(date);
      if (!month) continue;
      const sell = num(o.htotalpriceuser);
      const costYuan = num(o.hcostall);
      const rate = num(o.hratecost);
      // ทุน (บาท) = ราคาซื้อจริง(¥) × เรตต้นทุน — hcostall เก็บเป็นหยวน (ไม่ใช่บาท)
      const cost = round2(costYuan * rate);
      records.push({
        service: "shop",
        month,
        sell,
        cost,
        cbm: 0,
        transport: null,
        origin: null,
        // สั่งซื้อ unpriced = มีราคาขายแต่ยังไม่ลงต้นทุนจริง (hcostall=0) หรือยังไม่ตั้งเรตต้นทุน (hratecost=0)
        unpriced: sell > 0 && (costYuan <= 0 || rate <= 0),
      });
    }
  }

  return aggregatePaidWork(records, dateFrom, dateTo);
}
