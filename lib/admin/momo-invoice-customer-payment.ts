/**
 * momo-invoice-customer-payment.ts — โหลดคำตอบ "เก็บเงินลูกค้าแล้วหรือยัง" ของแต่ละ fid
 * บนใบต้นทุน MOMO (owner 2026-07-30). ตรรกะการจัดกลุ่ม/นับ อยู่ใน `-core.ts` (pure · มีเทส);
 * ไฟล์นี้เป็น **I/O ล้วน** และ **READ-ONLY ล้วน** — ไม่มี .update / .insert / .delete เลย.
 *
 * นิยาม "จ่ายแล้ว" + กฎจัดกลุ่ม + เหตุผลที่ต้องมี 2 ช่องทาง: อ่าน docblock ของ `-core.ts`
 * (สรุป: wallet = SOT เดียวกับรายงานค่าคอม/งานที่จ่ายแล้ว · billing-run = ช่องทางที่ 2 ที่มี
 * อยู่จริงบน prod 177 แถว และถ้าไม่เปิดเผยหน้านี้จะโกหก).
 *
 * ── กติกาความปลอดภัยของโมดูลนี้ (หน้าใบต้นทุน = จอเงินที่บัญชีใช้จริง) ──
 * · **ห้าม throw เด็ดขาด** — ทุก query destructure `error` → log แล้วเดินต่อ. พังทั้งก้อน
 *   คืน Map ว่าง ⇒ คอลัมน์โชว์ "ยังไม่พบการชำระ" (เดิมไม่มีคอลัมน์นี้ด้วยซ้ำ) แต่หน้าไม่ล้ม.
 * · chunk ทุก `.in()` (fid บนใบเป็นร้อยได้) + `fetchAllRows` ทุก query ที่อาจเกิน 1,000 แถว
 *   (PostgREST ตัดเงียบที่ 1,000 — กติกาบ้านเรา CLAUDE.md 2026-07-29).
 * · ไม่แตะเลข reconcile/ต้นทุน/ราคาขายใดๆ — เป็นการ "อ่านเพิ่ม" ล้วนๆ.
 */
import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  NO_PAYMENT,
  walletGroupKeyOf,
  type CustomerPaymentInfo,
  type WalletChildLike,
} from "./momo-invoice-customer-payment-core";

export type {
  CustomerPaymentInfo,
  CustomerPaymentChannel,
  CustomerPaymentSummary,
  PaymentSummaryRow,
} from "./momo-invoice-customer-payment-core";
export { buildCustomerPaymentSummary, NO_PAYMENT } from "./momo-invoice-customer-payment-core";

type AdminClient = ReturnType<typeof createAdminClient>;

const SCOPE = "[momo-invoice customer-payment]";
const CHUNK = 200;

const numOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown): number => numOrNull(v) ?? 0;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** มีไฟล์สลิปจริงไหม — `imagesslip` หรือ `slip_paths` (mig 0275 แนบได้หลายใบ). */
function hasSlipFile(row: { imagesslip?: string | null; slip_paths?: unknown } | null | undefined): boolean {
  if (!row) return false;
  if ((row.imagesslip ?? "").trim()) return true;
  return Array.isArray(row.slip_paths)
    && (row.slip_paths as unknown[]).some((p) => typeof p === "string" && p.trim() !== "");
}

type WalletRow = WalletChildLike & {
  reforder: string | null;
  date: string | null;
  amount: number | string | null;
  slip_paths: unknown;
};
type TopupRow = { id: number; amount: number | string | null; imagesslip: string | null; slip_paths: unknown };

const WALLET_COLS = "id, reforder, reforder2, userid, date, amount, imagesslip, slip_paths";

/**
 * คำตอบ "เก็บเงินลูกค้าแล้วหรือยัง" ของทุก fid ที่ส่งมา.
 *
 * ลำดับการถาม (สำคัญ — ห้ามสลับ): **wallet ก่อน** เพราะเป็น SOT เดียวกับรายงานค่าคอม
 * และถือทั้งสลิป + วันจ่ายรายแถว · ตกจาก wallet แล้วค่อยดู **ใบวางบิลที่จ่ายแล้ว**.
 *
 * @returns Map<fid, CustomerPaymentInfo> — fid ที่ไม่พบการชำระ **ไม่อยู่ใน Map**
 *          (ผู้เรียกใช้ `?? NO_PAYMENT`).
 */
export async function loadCustomerPaymentForFids(
  admin: AdminClient,
  fids: number[],
): Promise<Map<number, CustomerPaymentInfo>> {
  const out = new Map<number, CustomerPaymentInfo>();
  const wanted = [...new Set(fids.filter((f) => Number.isInteger(f) && f > 0))];
  if (wanted.length === 0) return out;

  try {
    // ── 1) การชำระ wallet ที่ settle แล้ว ของ fid เหล่านี้ (CHILD · reforder = fid) ──
    //    เงื่อนไข status='2' + reforder=fid = กฎเดียวกับ sales-commission/paid-work เป๊ะ.
    const walletByFid = new Map<number, WalletRow>();
    for (const grp of chunk(wanted, CHUNK)) {
      const { data, error } = await fetchAllRows<WalletRow>(() =>
        admin
          .from("tb_wallet_hs")
          .select(WALLET_COLS)
          .eq("status", "2")
          .in("reforder", grp.map(String))
          .order("id", { ascending: true }),
      );
      if (error) {
        console.error(`${SCOPE} wallet read failed`, { code: error.code, message: error.message });
        continue; // fail-soft: ก้อนนี้ตอบไม่ได้ ก้อนอื่นยังตอบได้
      }
      for (const w of data) {
        const fid = numOrNull(w.reforder);
        if (fid == null) continue;
        // แถวล่าสุดชนะ (แนวเดียวกับ commission report ที่ dedup reforder → วันจ่ายล่าสุด)
        const prev = walletByFid.get(fid);
        if (!prev || (w.date ?? "") >= (prev.date ?? "")) walletByFid.set(fid, w);
      }
    }

    // ── 2) กลุ่มของการชำระ ("ถ้ารวมชิปเม้นก็แจงมาด้วย") ──
    //    ดึง **พี่น้องทั้งกลุ่ม** ไม่ใช่แค่ที่อยู่บนใบรอบนี้ — ไม่งั้นคำว่า "คลุม N แทรค"
    //    จะเป็นคำโกหกเมื่อ MOMO บิลมาไม่ครบกลุ่ม (§0f).
    const topupIds = [
      ...new Set(
        [...walletByFid.values()]
          .map((w) => numOrNull(w.reforder2))
          .filter((v): v is number => v != null),
      ),
    ];
    const sharedSlips = [
      ...new Set(
        [...walletByFid.values()]
          .filter((w) => numOrNull(w.reforder2) == null && (w.imagesslip ?? "").trim())
          .map((w) => (w.imagesslip ?? "").trim()),
      ),
    ];

    /** groupKey → ทุกแถว wallet ในกลุ่มนั้น */
    const groupRows = new Map<string, WalletRow[]>();
    const addToGroup = (w: WalletRow) => {
      const key = walletGroupKeyOf(w);
      const list = groupRows.get(key);
      if (list) {
        if (!list.some((x) => x.id === w.id)) list.push(w);
      } else groupRows.set(key, [w]);
    };
    for (const w of walletByFid.values()) addToGroup(w);

    // 2a) cascade — พี่น้องทุกแถวที่ชี้ topup เดียวกัน
    for (const grp of chunk(topupIds, CHUNK)) {
      const { data, error } = await fetchAllRows<WalletRow>(() =>
        admin
          .from("tb_wallet_hs")
          .select(WALLET_COLS)
          .eq("status", "2")
          .in("reforder2", grp)
          .order("id", { ascending: true }),
      );
      if (error) {
        console.error(`${SCOPE} cascade siblings failed`, { code: error.code, message: error.message });
        continue;
      }
      for (const w of data) addToGroup(w);
    }

    // 2b) shared-slip — กฎเดียวกับ /admin/wallet/[id]:547-573 (type4 · ts2 · reforder2 NULL)
    //     กรอง userid ให้ตรงในฝั่ง JS: สลิปชื่อเดียวกันของคนละลูกค้าต้องไม่ถูกมัดรวม.
    for (const grp of chunk(sharedSlips, CHUNK)) {
      const { data, error } = await fetchAllRows<WalletRow>(() =>
        admin
          .from("tb_wallet_hs")
          .select(WALLET_COLS)
          .eq("status", "2")
          .eq("type", "4")
          .eq("typeservice", "2")
          .is("reforder2", null)
          .in("imagesslip", grp)
          .order("id", { ascending: true }),
      );
      if (error) {
        console.error(`${SCOPE} shared-slip siblings failed`, { code: error.code, message: error.message });
        continue;
      }
      for (const w of data) addToGroup(w);
    }

    // 2c) HEADER topup = แถวที่ถือ "ไฟล์สลิป" ของทรง cascade
    const topupById = new Map<number, TopupRow>();
    for (const grp of chunk(topupIds, CHUNK)) {
      const { data, error } = await admin
        .from("tb_wallet_hs")
        .select("id, amount, imagesslip, slip_paths")
        .in("id", grp);
      if (error) {
        console.error(`${SCOPE} topup read failed`, { code: error.code, message: error.message });
        continue;
      }
      for (const t of (data ?? []) as TopupRow[]) topupById.set(Number(t.id), t);
    }

    // ── 3) ใบเสร็จ: fid → tb_receipt_item.rid → tb_receipt (ไม่เอาใบที่ยกเลิก rstatus='2') ──
    //    ใช้เส้น item เพราะ `tb_receipt.refwhid` เติมไม่ครบ (prod 85/171) และ item ผูกกับ
    //    fid ตรงๆ = ตอบ "ใบเสร็จของงานนี้" ได้แม่นกว่า.
    const receiptByFid = new Map<number, { id: number; rid: string }>();
    {
      const ridByFid = new Map<number, string>();
      for (const grp of chunk(wanted, CHUNK)) {
        const { data, error } = await fetchAllRows<{ id: number; fid: number | string | null; rid: string | null }>(() =>
          admin.from("tb_receipt_item").select("id, fid, rid").in("fid", grp).order("id", { ascending: true }),
        );
        if (error) {
          console.error(`${SCOPE} receipt_item read failed`, { code: error.code, message: error.message });
          continue;
        }
        for (const it of data) {
          const fid = numOrNull(it.fid);
          const rid = (it.rid ?? "").trim();
          if (fid != null && rid) ridByFid.set(fid, rid);
        }
      }
      const rids = [...new Set(ridByFid.values())];
      const receiptByRid = new Map<string, { id: number; rid: string }>();
      for (const grp of chunk(rids, CHUNK)) {
        const { data, error } = await fetchAllRows<{ id: number; rid: string; rstatus: string | null }>(() =>
          admin.from("tb_receipt").select("id, rid, rstatus").in("rid", grp).neq("rstatus", "2").order("id", { ascending: true }),
        );
        if (error) {
          console.error(`${SCOPE} receipt read failed`, { code: error.code, message: error.message });
          continue;
        }
        for (const r of data) receiptByRid.set(r.rid, { id: Number(r.id), rid: r.rid });
      }
      for (const [fid, rid] of ridByFid) {
        const r = receiptByRid.get(rid);
        if (r) receiptByFid.set(fid, r);
      }
    }

    // ── 4) ช่องทางที่ 2: ใบวางบิลที่ "จ่ายแล้ว" (ดู docblock -core.ts) ──
    type InvItem = { invoice_id: number | string | null; forwarder_id: number | string | null; amount_thb: number | string | null };
    type Invoice = { id: number; doc_no: string | null; status: string | null; paid_at: string | null; total_thb: number | string | null; slip_path: string | null; slip_paths: unknown };
    const billingByFid = new Map<number, { inv: Invoice; amount: number | null }>();
    const billingCovered = new Map<number, number[]>(); // invoiceId → ทุก fid บนใบนั้น
    {
      const invIdByFid = new Map<number, { invoiceId: number; amount: number | null }>();
      for (const grp of chunk(wanted, CHUNK)) {
        const { data, error } = await fetchAllRows<InvItem & { id: number }>(() =>
          admin
            .from("tb_forwarder_invoice_item")
            .select("id, invoice_id, forwarder_id, amount_thb")
            .in("forwarder_id", grp)
            .order("id", { ascending: true }),
        );
        if (error) {
          console.error(`${SCOPE} invoice_item read failed`, { code: error.code, message: error.message });
          continue;
        }
        for (const it of data) {
          const fid = numOrNull(it.forwarder_id);
          const invId = numOrNull(it.invoice_id);
          if (fid != null && invId != null) invIdByFid.set(fid, { invoiceId: invId, amount: numOrNull(it.amount_thb) });
        }
      }
      const invIds = [...new Set([...invIdByFid.values()].map((v) => v.invoiceId))];
      const paidInvoices = new Map<number, Invoice>();
      for (const grp of chunk(invIds, CHUNK)) {
        const { data, error } = await fetchAllRows<Invoice>(() =>
          admin
            .from("tb_forwarder_invoice")
            .select("id, doc_no, status, paid_at, total_thb, slip_path, slip_paths")
            .in("id", grp)
            .eq("status", "paid")
            .order("id", { ascending: true }),
        );
        if (error) {
          console.error(`${SCOPE} invoice read failed`, { code: error.code, message: error.message });
          continue;
        }
        for (const inv of data) paidInvoices.set(Number(inv.id), inv);
      }
      for (const [fid, v] of invIdByFid) {
        const inv = paidInvoices.get(v.invoiceId);
        if (inv) billingByFid.set(fid, { inv, amount: v.amount });
      }
      // ทุก fid ที่ใบนั้นคลุม (รวมตัวที่ไม่ได้อยู่บนใบ MOMO รอบนี้)
      const paidIds = [...paidInvoices.keys()];
      for (const grp of chunk(paidIds, CHUNK)) {
        const { data, error } = await fetchAllRows<InvItem & { id: number }>(() =>
          admin
            .from("tb_forwarder_invoice_item")
            .select("id, invoice_id, forwarder_id, amount_thb")
            .in("invoice_id", grp)
            .order("id", { ascending: true }),
        );
        if (error) {
          console.error(`${SCOPE} invoice coverage read failed`, { code: error.code, message: error.message });
          continue;
        }
        for (const it of data) {
          const invId = numOrNull(it.invoice_id);
          const fid = numOrNull(it.forwarder_id);
          if (invId == null || fid == null) continue;
          const list = billingCovered.get(invId);
          if (list) { if (!list.includes(fid)) list.push(fid); } else billingCovered.set(invId, [fid]);
        }
      }
    }

    // ── 5) ประกอบคำตอบต่อ fid ──
    const draft = new Map<number, CustomerPaymentInfo>();
    for (const fid of wanted) {
      const w = walletByFid.get(fid);
      const receipt = receiptByFid.get(fid) ?? null;

      if (w) {
        const key = walletGroupKeyOf(w);
        const siblings = groupRows.get(key) ?? [w];
        const topupId = numOrNull(w.reforder2);
        const topup = topupId != null ? topupById.get(topupId) ?? null : null;
        // กลุ่มคลุม fid ไหนบ้าง (จาก reforder ของพี่น้องทุกแถว)
        const coveredFids = [
          ...new Set(siblings.map((s) => numOrNull(s.reforder)).filter((v): v is number => v != null)),
        ].sort((a, b) => a - b);
        const groupTotal = siblings.reduce((sum, s) => sum + Math.round(num(s.amount) * 100), 0) / 100;

        draft.set(fid, {
          paid: true,
          channel: "wallet",
          paidAt: w.date ?? null,
          amountThb: numOrNull(w.amount),
          // cascade: ยอดทั้งกลุ่ม = ยอด topup (ตรงกับ Σ children บน prod) · ไม่มี topup → Σ พี่น้อง
          groupTotalThb: topup ? numOrNull(topup.amount) ?? groupTotal : groupTotal,
          walletHsId: Number(w.id),
          slipWalletHsId: topup ? Number(topup.id) : hasSlipFile(w) ? Number(w.id) : null,
          billingInvoiceId: null,
          billingDocNo: null,
          hasSlip: topup ? hasSlipFile(topup) : hasSlipFile(w),
          receiptId: receipt?.id ?? null,
          receiptNo: receipt?.rid ?? null,
          coveredFids,
          coveredTrackings: [],
        });
        continue;
      }

      const b = billingByFid.get(fid);
      if (b) {
        const invId = Number(b.inv.id);
        const coveredFids = [...(billingCovered.get(invId) ?? [fid])].sort((a, b2) => a - b2);
        draft.set(fid, {
          paid: true,
          channel: "billing_run",
          paidAt: b.inv.paid_at ?? null,
          amountThb: b.amount,
          groupTotalThb: numOrNull(b.inv.total_thb),
          walletHsId: null,
          slipWalletHsId: null,
          billingInvoiceId: invId,
          billingDocNo: (b.inv.doc_no ?? "").trim() || null,
          hasSlip: hasSlipFile({ imagesslip: b.inv.slip_path, slip_paths: b.inv.slip_paths }),
          receiptId: receipt?.id ?? null,
          receiptNo: receipt?.rid ?? null,
          coveredFids,
          coveredTrackings: [],
        });
        continue;
      }

      // ยังไม่พบการชำระ — แต่ถ้ามีใบเสร็จอยู่ก็ยังบอกให้กดดูได้ (ข้อมูลอ้างอิงไม่หาย)
      if (receipt) {
        draft.set(fid, { ...NO_PAYMENT, receiptId: receipt.id, receiptNo: receipt.rid });
      }
    }

    // ── 6) เลขแทรคกิ้งของทุก fid ที่ถูกคลุม (ให้ "รวมชิปเม้น" กดเข้าไปดูได้ทีละตัว) ──
    const coveredAll = [
      ...new Set([...draft.values()].flatMap((p) => p.coveredFids)),
    ].filter((f) => Number.isInteger(f) && f > 0);
    const trackingByFid = new Map<number, string>();
    for (const grp of chunk(coveredAll, CHUNK)) {
      const { data, error } = await fetchAllRows<{ id: number; ftrackingchn: string | null }>(() =>
        admin.from("tb_forwarder").select("id, ftrackingchn").in("id", grp).order("id", { ascending: true }),
      );
      if (error) {
        console.error(`${SCOPE} tracking read failed`, { code: error.code, message: error.message });
        continue; // ไม่มีเลขแทรคกิ้ง = โชว์แค่จำนวน — ไม่ทำให้คำตอบผิด
      }
      for (const f of data) {
        const t = (f.ftrackingchn ?? "").trim();
        if (t) trackingByFid.set(Number(f.id), t);
      }
    }
    for (const [fid, info] of draft) {
      out.set(fid, {
        ...info,
        // ⚠️ ตำแหน่งต้องตรงกับ coveredFids เป๊ะ — หาไม่เจอใส่ "" ห้าม filter ทิ้ง
        // (ตัดทิ้งแล้วดัชนีเลื่อน = จอโชว์เลขแทรคกิ้งสลับตัวกัน)
        coveredTrackings: info.coveredFids.map((f) => trackingByFid.get(f) ?? ""),
      });
    }
    return out;
  } catch (e) {
    // จอเงิน — พังยังไงก็ต้องไม่ล้มทั้งหน้า (แย่สุด = คอลัมน์นี้ไม่มีข้อมูล)
    console.error(`${SCOPE} unexpected failure`, { error: String(e) });
    return out;
  }
}
