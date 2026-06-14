"use server";

/**
 * actions/admin/forwarder-tran-th.ts — Read-only reader for the legacy
 * TH-transport grouping flow (per `docs/briefs/poom-wave-2026-06-01.md` §6).
 *
 * Purpose: legacy `forwarder-action.php` lets admin select N delivered
 * forwarders + bundle them into one TH-transport batch (ใบจัดส่งในไทย —
 * "a single truck delivers these to customers"). Result tables:
 *
 *   • tb_forwarder_tran_th_h  (296 batches) — header: id · date · adminidcreate
 *   • tb_forwarder_tran_th_sub (643 items)  — link: id · ftthhid (→header) ·
 *                                              fid (→tb_forwarder.id)
 *
 * Brief §6: "No Pacred writer. Customer-side display exists at
 * `(protected)/service-import/[fNo]/page.tsx`; admin has nothing."
 *
 * READ side (list + detail) surfaces the historical batches + included
 * forwarders so accounting/dispatch staff can see what's already bundled.
 * WRITE side (2026-06-14 · W3): `adminCombineForwarderTransport` ports the
 * legacy notPortage "บันทึก และรวมค่าขนส่ง" POST — multi-row select →
 * create batch + stamp the TH delivery charge, with the legacy dedup-guard
 * (a forwarder can be in only one TH-transport batch). See §3 below.
 *
 * Per AGENTS.md §0c: every Supabase query destructures `error`.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Local resolveLegacyAdminId (same pattern as forwarders-field-edits.ts) —
// uuid auth user → legacy tb_admin.adminID slug for the legacy *adminid* cols.
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error(`[forwarder-tran-th.resolveLegacyAdminId] failed`, { code: error.code, message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error(`[forwarder-tran-th tb_admin lookup] failed`, { code: aErr.code, message: aErr.message });
  return data?.adminID ?? email.slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type TranThHeaderRow = {
  id:              number;
  date:            string | null;
  adminidcreate:   string;
  itemCount:       number;
};

export type TranThListResult = {
  rows:        TranThHeaderRow[];
  totalCount:  number;
  totalItems:  number;
};

export type TranThItemRow = {
  id:              number;
  fid:             number;
  forwarder: {
    fid:                  string | null;   // legacy doc id
    fdetail:              string | null;
    ftrackingchn:         string | null;
    ftrackingth:          string | null;
    faddressname:         string | null;
    faddresslastname:     string | null;
    faddressprovince:     string | null;
    faddresstel:          string | null;
    fstatus:              string | null;
    fdate:                string | null;
    famount:              number;
    fweight:              number;
    fvolume:              number;
  } | null;
};

export type TranThDetail = {
  header: TranThHeaderRow;
  items:  TranThItemRow[];
  totals: {
    itemCount:    number;
    totalWeight:  number;
    totalVolume:  number;
    totalBoxes:   number;
  };
};

// ────────────────────────────────────────────────────────────────────────
// 1. LIST
// ────────────────────────────────────────────────────────────────────────

export async function getTranThList(opts: {
  dateFrom?: string;
  dateTo?:   string;
  adminID?:  string;
  limit?:    number;
}): Promise<TranThListResult> {
  const admin = createAdminClient();

  // ── Headers ──
  let q = admin
    .from("tb_forwarder_tran_th_h")
    .select("id, date, adminidcreate")
    .order("date", { ascending: false })
    .limit(opts.limit ?? 300);

  if (opts.dateFrom) q = q.gte("date", `${opts.dateFrom}T00:00:00`);
  if (opts.dateTo)   q = q.lte("date", `${opts.dateTo}T23:59:59`);
  if (opts.adminID)  q = q.eq("adminidcreate", opts.adminID);

  const { data: headRaw, error: headErr } = await q;
  if (headErr) {
    console.error("[tb_forwarder_tran_th_h list] failed", { code: headErr.code, message: headErr.message });
  }
  type HRow = { id: number; date: string | null; adminidcreate: string };
  const headers = (headRaw ?? []) as unknown as HRow[];

  // ── Item counts per header — batched lookup ──
  const ids = headers.map((h) => h.id);
  type SubCountRow = { ftthhid: number };
  const itemsPerHeader = new Map<number, number>();
  let totalItems = 0;
  if (ids.length > 0) {
    const { data: subRaw, error: subErr } = await admin
      .from("tb_forwarder_tran_th_sub")
      .select("ftthhid")
      .in("ftthhid", ids);
    if (subErr) {
      console.error("[tb_forwarder_tran_th_sub count] failed", { code: subErr.code, message: subErr.message });
    }
    for (const r of ((subRaw ?? []) as unknown as SubCountRow[])) {
      itemsPerHeader.set(r.ftthhid, (itemsPerHeader.get(r.ftthhid) ?? 0) + 1);
      totalItems += 1;
    }
  }

  const rows: TranThHeaderRow[] = headers.map((h) => ({
    id:             h.id,
    date:           h.date,
    adminidcreate:  h.adminidcreate,
    itemCount:      itemsPerHeader.get(h.id) ?? 0,
  }));

  // ── Total count (separate query for accurate "ทั้งหมด" tally) ──
  const { count: totalCount, error: countErr } = await admin
    .from("tb_forwarder_tran_th_h")
    .select("id", { count: "exact", head: true });
  if (countErr) {
    console.error("[tb_forwarder_tran_th_h count] failed", { code: countErr.code, message: countErr.message });
  }

  return {
    rows,
    totalCount: totalCount ?? rows.length,
    totalItems,
  };
}

// ────────────────────────────────────────────────────────────────────────
// 2. DETAIL
// ────────────────────────────────────────────────────────────────────────

export async function getTranThDetail(id: number): Promise<TranThDetail | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const admin = createAdminClient();

  // ── Header ──
  const { data: headRaw, error: headErr } = await admin
    .from("tb_forwarder_tran_th_h")
    .select("id, date, adminidcreate")
    .eq("id", id)
    .maybeSingle();
  if (headErr) {
    console.error("[tb_forwarder_tran_th_h detail] failed", { code: headErr.code, message: headErr.message });
    return null;
  }
  if (!headRaw) return null;
  type HRow = { id: number; date: string | null; adminidcreate: string };
  const h = headRaw as HRow;

  // ── Sub rows → fids ──
  const { data: subRaw, error: subErr } = await admin
    .from("tb_forwarder_tran_th_sub")
    .select("id, fid")
    .eq("ftthhid", id);
  if (subErr) {
    console.error("[tb_forwarder_tran_th_sub detail] failed", { code: subErr.code, message: subErr.message });
  }
  type SubRow = { id: number; fid: number };
  const subs = (subRaw ?? []) as unknown as SubRow[];
  const fIds = Array.from(new Set(subs.map((s) => s.fid)));

  // ── Hydrate tb_forwarder for shipment metadata ──
  type FwdRow = {
    id: number;
    fid: string | null;
    fdetail: string | null;
    ftrackingchn: string | null;
    ftrackingth: string | null;
    faddressname: string | null;
    faddresslastname: string | null;
    faddressprovince: string | null;
    faddresstel: string | null;
    fstatus: string | null;
    fdate: string | null;
    famount: number | string | null;
    fweight: number | string | null;
    fvolume: number | string | null;
  };
  let fwdById = new Map<number, FwdRow>();
  if (fIds.length > 0) {
    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, fid, fdetail, ftrackingchn, ftrackingth, faddressname, faddresslastname, " +
        "faddressprovince, faddresstel, fstatus, fdate, famount, fweight, fvolume",
      )
      .in("id", fIds);
    if (fwdErr) {
      console.error("[tb_forwarder tran-th batch] failed", { code: fwdErr.code, message: fwdErr.message });
    }
    fwdById = new Map(((fwdRaw ?? []) as unknown as FwdRow[]).map((f) => [f.id, f]));
  }

  const items: TranThItemRow[] = subs.map((s) => {
    const f = fwdById.get(s.fid);
    return {
      id:  s.id,
      fid: s.fid,
      forwarder: f
        ? {
            fid:               f.fid,
            fdetail:           f.fdetail,
            ftrackingchn:      f.ftrackingchn,
            ftrackingth:       f.ftrackingth,
            faddressname:      f.faddressname,
            faddresslastname:  f.faddresslastname,
            faddressprovince:  f.faddressprovince,
            faddresstel:       f.faddresstel,
            fstatus:           f.fstatus,
            fdate:             f.fdate,
            famount:           Number(f.famount ?? 0),
            fweight:           Number(f.fweight ?? 0),
            fvolume:           Number(f.fvolume ?? 0),
          }
        : null,
    };
  });

  // Totals
  let totalWeight = 0;
  let totalVolume = 0;
  let totalBoxes  = 0;
  for (const it of items) {
    if (!it.forwarder) continue;
    totalWeight += it.forwarder.fweight;
    totalVolume += it.forwarder.fvolume;
    totalBoxes  += it.forwarder.famount;
  }

  return {
    header: {
      id:             h.id,
      date:           h.date,
      adminidcreate:  h.adminidcreate,
      itemCount:      items.length,
    },
    items,
    totals: {
      itemCount:   items.length,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalVolume: Math.round(totalVolume * 100000) / 100000,
      totalBoxes,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// 3. CREATE BATCH — "บันทึก และรวมค่าขนส่ง" (W3 · 2026-06-14)
// ────────────────────────────────────────────────────────────────────────
//
// Faithful port of legacy forwarder-action.php:4-46 (the notPortage
// updatefTransportPrice POST). Bundle N delivered-to-Thailand forwarders into
// ONE TH-transport batch + stamp the per-batch TH delivery charge. Steps:
//   1. Dup-guard — none of fIds already in tb_forwarder_tran_th_sub ('eRe').
//   2. INSERT tb_forwarder_tran_th_h (date, adminidcreate) → new header id.
//   3. INSERT tb_forwarder_tran_th_sub (fid, ftthhid) per fId.
//   4. UPDATE tb_forwarder.ftransportprice = X on fIds[0] ONLY (legacy sets the
//      batch charge on the first row — it feeds the invoice total via
//      actions/forwarder.ts).
//   5. UPDATE tb_forwarder.ftransportpricesum = '1' on ALL fIds (varchar(1) ·
//      "1=คิดรวมรายการอื่น" · the marker the notPortage queue filters out).
//
// Money note: ftransportprice is an absolute SET (not additive), so a stray
// re-run is not additive double-billing; the dup-guard + the '1' marker keep a
// forwarder out of two batches. A DB UNIQUE on tb_forwarder_tran_th_sub.fid is
// the proper backstop — queued for the W5 migration (0183) with the other
// create-side UNIQUEs.

const combineSchema = z.object({
  fIds: z.array(z.number().int().positive()).min(1, "เลือกอย่างน้อย 1 รายการ").max(400, "เลือกได้สูงสุด 400 รายการต่อรอบ"),
  fTransportPrice: z.number().min(0, "ค่าขนส่งต้องไม่ติดลบ").max(100_000, "ค่าขนส่งเกินเพดาน ฿100,000"),
});
export type AdminCombineForwarderTransportInput = z.infer<typeof combineSchema>;

export async function adminCombineForwarderTransport(
  input: AdminCombineForwarderTransportInput,
): Promise<AdminActionResult<{ batchId: number; combined: number }>> {
  const parsed = combineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { fTransportPrice } = parsed.data;
  const fIds = Array.from(new Set(parsed.data.fIds));

  return withAdmin<{ batchId: number; combined: number }>(
    ["super", "ops", "accounting", "warehouse"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 20);
      const nowIso = new Date().toISOString();

      // 1. Dup-guard (legacy 'eRe') — none already in a TH-transport batch.
      const { data: already, error: dupErr } = await admin
        .from("tb_forwarder_tran_th_sub")
        .select("fid")
        .in("fid", fIds);
      if (dupErr) {
        console.error("[combineForwarderTransport dup-check] failed", { code: dupErr.code, message: dupErr.message });
        return { ok: false, error: `ตรวจสอบรายการซ้ำไม่สำเร็จ: ${dupErr.message}` };
      }
      if (already && already.length > 0) {
        const dupIds = (already as { fid: number }[]).map((r) => r.fid);
        return { ok: false, error: `มี ${dupIds.length} รายการที่รวมบิลขนส่งไปแล้ว (เช่น #${dupIds.slice(0, 5).join(", #")}) — เอาออกแล้วลองใหม่` };
      }

      // 2. Create the batch header.
      const { data: header, error: hErr } = await admin
        .from("tb_forwarder_tran_th_h")
        .insert({ date: nowIso, adminidcreate: legacyAdminId })
        .select("id")
        .single<{ id: number }>();
      if (hErr || !header) {
        console.error("[combineForwarderTransport header insert] failed", { code: hErr?.code, message: hErr?.message });
        return { ok: false, error: `สร้างบิลรวมไม่สำเร็จ: ${hErr?.message ?? "insert failed"}` };
      }

      // 3. Link rows.
      const { error: subErr } = await admin
        .from("tb_forwarder_tran_th_sub")
        .insert(fIds.map((fid) => ({ fid, ftthhid: header.id })));
      if (subErr) {
        await admin.from("tb_forwarder_tran_th_h").delete().eq("id", header.id); // roll back orphan header
        console.error("[combineForwarderTransport sub insert] failed", { code: subErr.code, message: subErr.message });
        // 0183 backstop — ux_tb_forwarder_tran_th_sub_fid rejects a concurrent
        // combine / double-click that slipped past the dup-guard (333-344) with
        // a raw Postgres 23505. Surface a friendly Thai message instead.
        if (subErr.code === "23505") {
          return { ok: false, error: "รายการนี้ถูกรวมบิลขนส่งไปแล้ว" };
        }
        return { ok: false, error: `บันทึกรายการในบิลรวมไม่สำเร็จ: ${subErr.message}` };
      }

      // 4. Set the batch TH-delivery charge on the first row (legacy).
      const { error: priceErr } = await admin
        .from("tb_forwarder")
        .update({ ftransportprice: fTransportPrice, adminidupdate: legacyAdminId })
        .eq("id", fIds[0]);
      if (priceErr) {
        console.error("[combineForwarderTransport price set] failed", { code: priceErr.code, message: priceErr.message });
        return { ok: false, error: `บันทึกค่าขนส่งไม่สำเร็จ: ${priceErr.message}` };
      }

      // 5. Mark every row combined (notPortage queue excludes ftransportpricesum='1').
      const { error: sumErr } = await admin
        .from("tb_forwarder")
        .update({ ftransportpricesum: "1" })
        .in("id", fIds);
      if (sumErr) {
        console.error("[combineForwarderTransport sum mark] failed", { code: sumErr.code, message: sumErr.message });
        return { ok: false, error: `อัปเดตสถานะรวมบิลไม่สำเร็จ: ${sumErr.message}` };
      }

      await logAdminAction(adminId, "forwarder.combine_transport", "tb_forwarder_tran_th_h", String(header.id), {
        batch_id: header.id, fids: fIds, ftransportprice: fTransportPrice,
      });

      revalidatePath("/admin/forwarder-action");
      return { ok: true, data: { batchId: header.id, combined: fIds.length } };
    },
  );
}
