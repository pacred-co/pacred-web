"use server";

/**
 * actions/admin/sales-payouts-tb.ts — the FAITHFUL ADMIN pay-out side of the
 * sales-commission loop, on the legacy `tb_user_sales_admin_pay` family
 * (P0-23 · ADR-0020). This is the counterpart to the customer earn→withdraw
 * path in `actions/commissions-tb.ts` (read-only reference).
 *
 * Path A (faithful) per `docs/decisions/0020-commission-sot.md`: the canonical
 * commission SOT is `tb_user_sales` + `tb_user_sales_admin_pay` +
 * `tb_user_sales_pay` (legacy, has the 4 VIP teams' real accruals). The
 * rebuilt `sales_payouts` / `sales_commissions` tables (the DEAD twin in
 * `actions/admin/sales-payouts.ts`) are empty on prod → silent dead-write.
 *
 * Legacy source this file transcribes — `pcs-admin/report-user-sales-history.php`:
 *
 *   - LIST mode (L79-81): the pending-payout queue.
 *       SELECT ID, DATE(date), TIME(date), imagesSlip, amount, adminCreate,
 *              userIDMain, status FROM tb_user_sales_admin_pay WHERE status=2
 *     (status='2' = customer requested a payout · awaiting admin pay-out.)
 *
 *   - DETAIL mode (L198-330): one payout + bank-transfer fields + ID-card file
 *       SELECT file, ID, DATE(dateSlip), TIME(dateSlip), imagesSlip, amount,
 *              adminCreate, userIDMain, status, name_blank, no_blank,
 *              name_account FROM tb_user_sales_admin_pay WHERE ID='$ID';
 *     then the linked forwarder rows:
 *       SELECT IDUS FROM tb_user_sales_pay WHERE IDUSAP='$ID'   (the link rows)
 *       → tb_user_sales (by id IN IDUS) LEFT JOIN tb_forwarder (f.ID=us.IDF)
 *     Each forwarder row shows: fDetail · fTrackingCHN · fVolume · fWeight ·
 *     fCostTotalPrice (ต้นทุนนำเข้าจีน) · fTotalPrice (ค่าฝากนำเข้าจีน) ·
 *     fProfitTotal − fShippingService (กำไรสุทธิ) · fStatus · usStatus.
 *
 *   - PAY action (POST `update`, L160-195): admin uploads imagesSlip, then
 *       SELECT ID FROM tb_user_sales_admin_pay WHERE ID='$ID' AND status=2;
 *       (guard — must still be pending, prevents double-pay)
 *       UPDATE tb_user_sales_admin_pay SET status=3, imagesSlip='$file',
 *              adminCreate='$adminID', dateSlip=NOW() WHERE ID='$ID';
 *     status '2'→'3' (สำเร็จ / paid out). adminCreate is overwritten with the
 *     paying admin's id (the customer-create wrote the agent's member_code;
 *     the pay-out rewrites it to the staff id — legacy L188).
 *
 * `tb_*` is RLS-locked to service_role → all reads/writes go through the admin
 * client. The slip upload reuses the SAME `slips` bucket the wallet slip uses
 * (lib/storage/upload.ts → uploadToBucket).
 *
 * CASING (php-port-patterns.md): tb_user_sales_admin_pay / tb_user_sales /
 * tb_user_sales_pay / tb_forwarder are all LOWERCASE on prod; only
 * tb_users/tb_admin/tb_co are camelCase. Column names below mirror exactly
 * what actions/commissions-tb.ts already writes (useridmain · imagesslip ·
 * dateslip · admincreate · name_blank · no_blank · name_account · file).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same per-file helper pattern as wallet-hs.ts.
// tb_user_sales_admin_pay.admincreate is varchar(20) → clip to 20.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[sales-payouts-tb auth.getUser] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[sales-payouts-tb tb_admin] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return String(data.adminID).slice(0, 20);
  return email.slice(0, 20);
}

// ════════════════════════════════════════════════════════════════
// 1. getPendingSalesPayoutsTb — the LIST mode (legacy L79-81).
// ════════════════════════════════════════════════════════════════

export type SalesPayoutQueueRow = {
  id: number;
  /** when the customer requested the payout (tb_user_sales_admin_pay.date). */
  date: string | null;
  /** the team code (legacy userIDMain · e.g. "THADA.VIP"). */
  userIDMain: string;
  /** net commission to pay out (1% − 3% WHT, already computed at request). */
  amount: number;
  /** the pay-out slip filename (empty until admin pays it out). */
  imagesSlip: string;
  /** '2'=pending payout · '3'=paid (this queue only returns '2'). */
  status: string;
  /** who created/paid the row (member_code at request; admin id once paid). */
  adminCreate: string | null;
};

/**
 * The pending-payout queue: every tb_user_sales_admin_pay row at status='2'.
 * Faithful to `report-user-sales-history.php` L79-81 (the `?s` filter mode).
 */
export async function getPendingSalesPayoutsTb(): Promise<
  AdminActionResult<SalesPayoutQueueRow[]>
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_user_sales_admin_pay")
    .select("id, date, useridmain, amount, imagesslip, status, admincreate")
    .eq("status", "2")
    .order("date", { ascending: false });
  if (error) {
    console.error(`[sales-payouts-tb queue] failed`, { code: error.code, message: error.message });
    return { ok: false, error: `queue_lookup_failed: ${error.message}` };
  }
  const rows: SalesPayoutQueueRow[] = (
    (data ?? []) as Array<{
      id: number;
      date: string | null;
      useridmain: string;
      amount: number | string | null;
      imagesslip: string | null;
      status: string;
      admincreate: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    date: r.date,
    userIDMain: r.useridmain,
    amount: Number(r.amount ?? 0),
    imagesSlip: r.imagesslip ?? "",
    status: r.status,
    adminCreate: r.admincreate,
  }));
  return { ok: true, data: rows };
}

// ════════════════════════════════════════════════════════════════
// 2. getSalesPayoutDetailTb — the DETAIL mode (legacy L198-330).
// ════════════════════════════════════════════════════════════════

export type SalesPayoutLinkedForwarder = {
  /** tb_forwarder.id — links to /admin/forwarders/<id>. */
  forwarderId: number | null;
  /** tb_user_sales.id (the link row's IDUS). */
  usId: number;
  /** the forwarder creation date (tb_forwarder.date). */
  date: string | null;
  fDetail: string | null;
  fTrackingCHN: string | null;
  /** ปริมาตร (CBM). */
  fVolume: number;
  /** น้ำหนัก (Kg). */
  fWeight: number;
  /** ต้นทุนนำเข้าจีน. */
  fCostTotalPrice: number;
  /** ค่าฝากนำเข้าจีน (ราคาขาย). */
  fTotalPrice: number;
  /** ส่วนลด. */
  fDiscount: number;
  /** กำไรสุทธิ = fProfitTotal − fShippingService (legacy L388). */
  netProfit: number;
  /** forwarder status '1'..'7'. */
  fStatus: string | null;
  /** withdraw status '1'=ยังไม่เบิกจ่าย · '2'=เบิกจ่ายแล้ว. */
  usStatus: string | null;
  adminIDUpdate: string | null;
};

export type SalesPayoutDetail = {
  id: number;
  status: string;
  userIDMain: string;
  amount: number;
  /** the pay-out slip filename (set once paid). */
  imagesSlip: string;
  /** when paid out (tb_user_sales_admin_pay.dateslip). */
  dateSlip: string | null;
  /** the customer's ID-card file (tb_user_sales_admin_pay.file). */
  file: string | null;
  /** bank-transfer fields the customer supplied at request. */
  nameBank: string | null;
  noBank: string | null;
  nameAccount: string | null;
  adminCreate: string | null;
  /** the linked forwarder rows (legacy L339-396). */
  forwarders: SalesPayoutLinkedForwarder[];
  /** ราคาขายรวม Σ(fTotalPrice − fDiscount) over the team's CHN rows. */
  totalSalePriceCHN: number;
};

/**
 * Full payout detail: the header (bank fields + ID-card) + the linked
 * forwarder rows. Faithful to `report-user-sales-history.php` L198-330.
 *
 *   header  : tb_user_sales_admin_pay WHERE id=$id
 *   link    : tb_user_sales_pay WHERE idusap=$id  → idus[]
 *   rows    : tb_user_sales (by id IN idus) → tb_forwarder (by idf)
 */
export async function getSalesPayoutDetailTb(
  id: number,
): Promise<AdminActionResult<SalesPayoutDetail>> {
  const payoutId = Number(id);
  if (!Number.isInteger(payoutId) || payoutId <= 0) {
    return { ok: false, error: "invalid_id" };
  }

  const admin = createAdminClient();

  // ── header (legacy L199) ──
  const { data: headRaw, error: headErr } = await admin
    .from("tb_user_sales_admin_pay")
    .select(
      "id, status, useridmain, amount, imagesslip, dateslip, file, name_blank, no_blank, name_account, admincreate",
    )
    .eq("id", payoutId)
    .maybeSingle<{
      id: number;
      status: string;
      useridmain: string;
      amount: number | string | null;
      imagesslip: string | null;
      dateslip: string | null;
      file: string | null;
      name_blank: string | null;
      no_blank: string | null;
      name_account: string | null;
      admincreate: string | null;
    }>();
  if (headErr) {
    console.error(`[sales-payouts-tb detail header] failed`, { code: headErr.code, message: headErr.message });
    return { ok: false, error: `detail_lookup_failed: ${headErr.message}` };
  }
  if (!headRaw) return { ok: false, error: "not_found" };

  // ── link rows: tb_user_sales_pay WHERE idusap=$id (legacy L341) ──
  const { data: linkRaw, error: linkErr } = await admin
    .from("tb_user_sales_pay")
    .select("idus")
    .eq("idusap", payoutId);
  if (linkErr) {
    console.error(`[sales-payouts-tb detail links] failed`, { code: linkErr.code, message: linkErr.message });
    return { ok: false, error: `detail_links_failed: ${linkErr.message}` };
  }
  const idusList = [...new Set(((linkRaw ?? []) as { idus: number }[]).map((l) => l.idus))];

  let forwarders: SalesPayoutLinkedForwarder[] = [];
  let totalSalePriceCHN = 0;

  if (idusList.length > 0) {
    // ── tb_user_sales (by id IN idus) — get usstatus + idf (legacy L353-358) ──
    const { data: usRaw, error: usErr } = await admin
      .from("tb_user_sales")
      .select("id, idf, usstatus")
      .in("id", idusList);
    if (usErr) {
      console.error(`[sales-payouts-tb detail tb_user_sales] failed`, { code: usErr.code, message: usErr.message });
      return { ok: false, error: `detail_us_failed: ${usErr.message}` };
    }
    const usRows = (usRaw ?? []) as { id: number; idf: number; usstatus: string | null }[];

    // ── tb_forwarder (by idf) — the displayed cargo metrics (legacy L356) ──
    const forwarderIds = [...new Set(usRows.map((u) => u.idf))];
    type FwdRow = {
      id: number;
      date: string | null;
      fdetail: string | null;
      ftrackingchn: string | null;
      fvolume: number | string | null;
      fweight: number | string | null;
      fcosttotalprice: number | string | null;
      ftotalprice: number | string | null;
      fdiscount: number | string | null;
      fprofittotal: number | string | null;
      fshippingservice: number | string | null;
      fstatus: string | null;
      adminidupdate: string | null;
    };
    let fwdById = new Map<number, FwdRow>();
    if (forwarderIds.length > 0) {
      const { data: fwdRaw, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, date, fdetail, ftrackingchn, fvolume, fweight, fcosttotalprice, ftotalprice, fdiscount, fprofittotal, fshippingservice, fstatus, adminidupdate",
        )
        .in("id", forwarderIds);
      if (fwdErr) {
        console.error(`[sales-payouts-tb detail tb_forwarder] failed`, { code: fwdErr.code, message: fwdErr.message });
        return { ok: false, error: `detail_forwarder_failed: ${fwdErr.message}` };
      }
      fwdById = new Map(((fwdRaw ?? []) as FwdRow[]).map((f) => [f.id, f]));
    }

    forwarders = usRows.map((u) => {
      const f = fwdById.get(u.idf);
      const fTotalPrice = Number(f?.ftotalprice ?? 0);
      const fDiscount = Number(f?.fdiscount ?? 0);
      // ราคาขายรวม accumulator — legacy L376: fTotalPrice − fDiscount.
      totalSalePriceCHN += fTotalPrice - fDiscount;
      return {
        forwarderId: f?.id ?? null,
        usId: u.id,
        date: f?.date ?? null,
        fDetail: f?.fdetail ?? null,
        fTrackingCHN: f?.ftrackingchn ?? null,
        fVolume: Number(f?.fvolume ?? 0),
        fWeight: Number(f?.fweight ?? 0),
        fCostTotalPrice: Number(f?.fcosttotalprice ?? 0),
        fTotalPrice,
        fDiscount,
        // กำไรสุทธิ = fProfitTotal − fShippingService (legacy L388).
        netProfit: Number(f?.fprofittotal ?? 0) - Number(f?.fshippingservice ?? 0),
        fStatus: f?.fstatus ?? null,
        usStatus: u.usstatus,
        adminIDUpdate: f?.adminidupdate ?? null,
      };
    });
  }

  return {
    ok: true,
    data: {
      id: headRaw.id,
      status: headRaw.status,
      userIDMain: headRaw.useridmain,
      amount: Number(headRaw.amount ?? 0),
      imagesSlip: headRaw.imagesslip ?? "",
      dateSlip: headRaw.dateslip,
      file: headRaw.file,
      nameBank: headRaw.name_blank,
      noBank: headRaw.no_blank,
      nameAccount: headRaw.name_account,
      adminCreate: headRaw.admincreate,
      forwarders,
      totalSalePriceCHN,
    },
  };
}

// ════════════════════════════════════════════════════════════════
// 3. adminMarkSalesPayoutPaidTb — the PAY action (legacy L160-195).
// ════════════════════════════════════════════════════════════════

const payoutPaidSchema = z.object({
  id: z.number().int().positive(),
});
export type AdminMarkSalesPayoutPaidTbInput = z.infer<typeof payoutPaidSchema>;

/**
 * Mark a pending payout as paid (status '2'→'3'). Faithful port of the
 * `report-user-sales-history.php` POST `update` branch (L160-195):
 *
 *   1. validate ID + slip file present (L161-167).
 *   2. guard: SELECT ID FROM tb_user_sales_admin_pay WHERE ID='$ID' AND status=2
 *      (L184) — the row MUST still be pending, blocks double-pay.
 *   3. UPDATE status=3 · imagesSlip='$file' · adminCreate='$adminID' ·
 *      dateSlip=NOW() (L188).
 *
 * The slip image is uploaded to the SAME `slips` bucket the wallet slip uses
 * (legacy stored it in `../storage/slip/`; Pacred uses the `slips` bucket).
 *
 * Atomicity note: the guard is enforced at the DB layer via
 * `.eq("status", "2")` on the UPDATE — if a concurrent pay-out already
 * flipped it to '3', this update matches 0 rows → we detect that and reject
 * (the legacy `AND status=2` SELECT-then-UPDATE has a TOCTOU window; folding
 * the guard into the UPDATE's WHERE closes it).
 */
export async function adminMarkSalesPayoutPaidTb(
  input: AdminMarkSalesPayoutPaidTbInput,
  slipImage: File,
): Promise<AdminActionResult<{ id: number; imagesSlip: string }>> {
  const parsed = payoutPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  // Slip file required (legacy L165 — "กรุณเลือกรูปข้อมูลให้ครบ").
  if (!(slipImage instanceof File) || slipImage.size === 0) {
    return { ok: false, error: "กรุณาแนบหลักฐานการโอน (สลิปรายการ)" };
  }

  return withAdmin<{ id: number; imagesSlip: string }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // ── guard pre-read: must still be a pending payout (status='2') ──
      // (legacy L184 SELECT — gives a clean error if already paid/missing.)
      const { data: row, error: rowErr } = await admin
        .from("tb_user_sales_admin_pay")
        .select("id, status, useridmain, amount")
        .eq("id", id)
        .maybeSingle<{ id: number; status: string; useridmain: string; amount: number | string | null }>();
      if (rowErr) {
        console.error(`[sales-payouts-tb pay lookup] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!row) return { ok: false, error: "ไม่พบรายการ" };
      if (row.status === "3") {
        return { ok: false, error: "รายการนี้จ่ายเงินไปแล้ว (status=3)" };
      }
      if (row.status !== "2") {
        return { ok: false, error: `รายการนี้สถานะไม่ใช่ 'รอดำเนินการ' (status=${row.status})` };
      }

      // ── upload the slip (legacy L176-187 move_uploaded_file) ──
      // SAME bucket as the wallet slip (lib/storage/upload.ts → `slips`).
      const up = await uploadToBucket(slipImage, "slips", `admin/sales-payout-slip/${row.useridmain}`);
      if (!up.ok) return { ok: false, error: `อัปโหลดสลิปไม่สำเร็จ: ${up.error}` };
      const imagesSlip = up.filename;

      // ── UPDATE status 2→3 (legacy L188) — guard folded into WHERE ──
      // `.eq("status", "2")` closes the legacy SELECT-then-UPDATE TOCTOU:
      // a concurrent pay-out that already flipped it → 0 rows matched.
      const nowIso = new Date().toISOString();
      const { data: updated, error: updErr } = await admin
        .from("tb_user_sales_admin_pay")
        .update({
          status: "3",
          imagesslip: imagesSlip,
          admincreate: legacyAdminId,
          dateslip: nowIso,
        })
        .eq("id", id)
        .eq("status", "2")
        .select("id")
        .maybeSingle<{ id: number }>();
      if (updErr) {
        console.error(`[sales-payouts-tb pay update] failed`, { code: updErr.code, message: updErr.message });
        // Roll back the uploaded slip so no orphan file lingers.
        await admin.storage.from("slips").remove([imagesSlip]);
        return { ok: false, error: updErr.message };
      }
      if (!updated) {
        // 0 rows matched — a concurrent pay-out won the race.
        await admin.storage.from("slips").remove([imagesSlip]);
        return { ok: false, error: "รายการนี้ถูกจ่ายเงินไปแล้ว (มีผู้ทำรายการพร้อมกัน)" };
      }

      await logAdminAction(adminId, "tb_user_sales_admin_pay.pay", "tb_user_sales_admin_pay", String(id), {
        useridmain: row.useridmain,
        amount: Number(row.amount ?? 0),
        imagesSlip,
        fromStatus: "2",
        toStatus: "3",
      });

      revalidatePath("/admin/sales-payouts");
      revalidatePath(`/admin/sales-payouts/${id}`);
      return { ok: true, data: { id, imagesSlip } };
    },
  );
}
