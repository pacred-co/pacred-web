"use server";

/**
 * Faithful-port Server Action for the legacy `ทำรายการจ่ายเงินตู้`
 * (container-payment) flow — `pcs-admin/report-cnt.php` L4-101
 * POST handler (D1 / ADR-0017).
 *
 * The legacy flow:
 *   1. Admin checks one-or-more containers (fCabinetNumber) on the
 *      report-cnt list, fills bank slip metadata + optional PDF.
 *   2. The POST submits `arrID` (comma-CSV of cabinet numbers) +
 *      nameBlank/noBlank/nameAccount/cntAmount + optional cntFile.
 *   3. PHP validates `tb_cnt_item` has NO existing row for any of
 *      the selected cabinet numbers (a container can only be paid
 *      once).
 *   4. INSERT INTO tb_cnt (cntName=CSV of cabinet numbers,
 *      cntStatus='1' [รอดำเนินการ], cntAmount, date=NOW,
 *      adminIDCreate, nameBlank, noBlank, nameAccount, cntFile).
 *   5. Look up tb_forwarder rows by fCabinetNumber to harvest
 *      fIDorCO + fTrackingCHN lists → bulk-INSERT into
 *      `tb_cnt_pay_idorco` and `tb_cnt_pay_trackingchn`.
 *   6. Bulk-INSERT `tb_cnt_item` linking each cabinet to the new
 *      cntID. (the join table that `tb_cnt_item.cntid` lookup
 *      drives the "จ่ายแล้ว" badge on report-cnt list.)
 *
 * Schema — Postgres column names are LOWERCASE (per migration 0081
 * which loaded the legacy MySQL dump; the camelCase MySQL names
 * collapsed to lowercase on import). See migration 0081 L1006-1152
 * for the four tables involved.
 *
 * Storage: PDF uploads land in the `member-docs` bucket under
 * `cnt-payment/<cnt_id>/<filename>` (per ภูม brief 2026-05-20).
 * The `cntfile` column stores the relative path inside the bucket.
 *
 * Auth: `withAdmin(["super", "ops", "accounting"])` mirrors the
 * legacy `departmentKey` gate (cnt-hs.php L185 — CEO / Manager /
 * QA&QC / Accounting / ITDT) softened to the Pacred V3 role taxonomy.
 *
 * adminID note: same approach as `combine-bill.ts` —
 * `tb_cnt.adminidcreate` is a varchar(30) holding the legacy
 * `tb_admin.adminID` username (e.g. "POPP"). We resolve it via the
 * current Supabase user's email → `tb_admin.adminEmail` → `adminID`
 * lookup; fallback to a 30-char email slice so the NOT NULL holds.
 *
 * Faithful-port gotcha: the legacy SELECT-after-INSERT (report-cnt.php
 * L51-56) to recover the new cntID is brittle (same-millisecond inserts
 * collide on `date + adminIDCreate`). PostgREST `.insert().select()`
 * returns the inserted row natively — we use that instead.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// Zod schema — kept in-file because the worktree spec restricts
// edits to this single file (combine-bill.ts has its schema in
// lib/validators/ — for this pilot we co-locate to honour the
// "touch only X" guard).
// ────────────────────────────────────────────────────────────

/**
 * Parse comma-CSV cabinet-number payload into a clean string[].
 * Mirrors report-cnt.php L10 `explode(",", $_POST['arrID'])`.
 * Trims + dedupes + rejects empty tokens.
 */
function parseCabinetNumbersCsv(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];
  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return Array.from(new Set(tokens));
}

export const createCntPaymentSchema = z.object({
  /** Cabinet numbers (`tb_forwarder.fcabinetnumber`) to pay for.
   *  Form callers may pass the raw comma-CSV; programmatic callers
   *  pass a clean string[]. */
  cabinetNumbers: z
    .union([z.string(), z.array(z.string())])
    .transform((v, ctx) => {
      const arr = Array.isArray(v)
        ? Array.from(new Set(v.map((s) => s.trim()).filter((s) => s.length > 0)))
        : parseCabinetNumbersCsv(v);
      if (arr.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "กรุณากรอกข้อมูลให้ครบ",
        });
        return z.NEVER;
      }
      return arr;
    }),

  /** จำนวนเงินที่จ่าย — numeric(10,2). Legacy validates via PHP cast. */
  cntAmount: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine(
      (n) => Number.isFinite(n) && n >= 0,
      { message: "จำนวนเงินไม่ถูกต้อง" },
    ),

  /** ธนาคาร — varchar(300) NOT NULL */
  nameBlank: z.string().trim().min(1, { message: "กรุณาระบุชื่อธนาคาร" }).max(300),

  /** เลขที่บัญชี — varchar(200) NOT NULL */
  noBlank: z.string().trim().min(1, { message: "กรุณาระบุเลขที่บัญชี" }).max(200),

  /** ชื่อบัญชี — varchar(300) NOT NULL */
  nameAccount: z.string().trim().min(1, { message: "กรุณาระบุชื่อบัญชี" }).max(300),
});
export type CreateCntPaymentInput = z.input<typeof createCntPaymentSchema>;

// ────────────────────────────────────────────────────────────
// Helper — resolve the current Supabase user's legacy
// tb_admin.adminID (the varchar(30) username string).
// Same pattern as combine-bill.ts `resolveLegacyAdminId`.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
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
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;

  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// CREATE — report-cnt.php L4-101 addPay POST handler
// ────────────────────────────────────────────────────────────
//
// File handling:
//   - If `file` is a non-empty PDF File → upload to `member-docs`
//     bucket under `cnt-payment/<cnt_id>/<filename>` after the
//     tb_cnt row exists (we need cnt_id to build the path).
//   - If `file` is null/undefined → insert NULL into cntfile.
//   - If the upload fails the tb_cnt row stays (faithful: legacy
//     leaves the row even if move_uploaded_file fails) and we
//     log the failure to the audit log.

export async function adminCreateCntPayment(
  input: CreateCntPaymentInput,
  file?: File | null,
): Promise<
  AdminActionResult<{
    cntId: number;
    cabinetNumbers: string[];
    filePath: string | null;
  }>
> {
  const parsed = createCntPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { cabinetNumbers, cntAmount, nameBlank, noBlank, nameAccount } =
    parsed.data;

  // PDF-file precheck — must be a real File, < 10 MB, .pdf extension
  // (legacy report-cnt.php L24-29 enforces `pathinfo extension === 'pdf'`).
  let validatedFile: File | null = null;
  if (file && file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
    }
    const lower = (file.name ?? "").toLowerCase();
    if (!lower.endsWith(".pdf")) {
      return { ok: false, error: "ไฟล์ไม่ถูกต้อง" };
    }
    validatedFile = file;
  }

  return withAdmin<{
    cntId: number;
    cabinetNumbers: string[];
    filePath: string | null;
  }>(["super", "ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── (a) Duplicate guard — report-cnt.php L12-14 ──
    //   SELECT ID FROM tb_cnt_item WHERE fCabinetNumber IN (…)
    // If ANY cabinet number is already on a tb_cnt_item row, the
    // container has been paid before — legacy returns the 'eRe'
    // (ทำรายซ่ำ) error code. We surface the duplicate list so the
    // operator can fix the selection.
    const { data: existing, error: dupErr } = await admin
      .from("tb_cnt_item")
      .select("ID, fCabinetNumber, cntID")
      .in("fCabinetNumber", cabinetNumbers);
    if (dupErr) return { ok: false, error: dupErr.message };
    if ((existing?.length ?? 0) > 0) {
      const dupList = (existing ?? [])
        .map((r) => r.fCabinetNumber)
        .join(", ");
      return {
        ok: false,
        error: `เลขตู้รายการนี้มีการจ่ายเงินไปแล้ว: ${dupList}`,
      };
    }

    // ── (b) Resolve the legacy admin username ──
    const legacyAdminId = await resolveLegacyAdminId();

    // ── (c) INSERT tb_cnt — report-cnt.php L41-42 ──
    //   INSERT INTO tb_cnt (cntName, cntStatus='1', cntAmount, date,
    //                       adminIDCreate, nameBlank, noBlank,
    //                       nameAccount, cntFile=NULL initially)
    // `cntname` carries the comma-joined cabinet list (legacy stores
    // the raw $_POST['arrID'] string here for display in the table).
    // The NOT NULL columns that we don't fill yet (`cntimagesslip`,
    // `dateupdate`, `adminidupdate`) get safe defaults — empty string
    // for the varchars (matches legacy SQL where PHP-NULL on a NOT
    // NULL varchar coerces to '').
    const nowIso = new Date().toISOString();
    const cntNameCsv = cabinetNumbers.join(",");

    const { data: cntRow, error: cntErr } = await admin
      .from("tb_cnt")
      .insert({
        cntName:        cntNameCsv,
        cntStatus:      "1",
        cntAmount:      cntAmount,
        cntImagesSlip:  "", // legacy slip column — unused on this entry path
        date:           nowIso,
        adminIDCreate:  legacyAdminId,
        nameBlank:      nameBlank,
        noBlank:        noBlank,
        nameAccount:    nameAccount,
        cntFile:        "",
        dateUpdate:     null,
        adminIDUpdate:  "",
      })
      .select("ID")
      .single<{ ID: number }>();
    if (cntErr || !cntRow) {
      return { ok: false, error: cntErr?.message ?? "insert_failed" };
    }
    const cntId = Number(cntRow.ID);

    // ── (d) Upload the PDF (if any) — report-cnt.php L24-39 + L45-47 ──
    // TODO: confirm `member-docs` bucket exists on prod — if it doesn't,
    // the upload errors are logged + cntfile stays empty (faithful: the
    // legacy code also tolerated upload failures, only the move_uploaded_file
    // return value was checked but not used to gate downstream INSERTs).
    let filePath: string | null = null;
    if (validatedFile) {
      const safeName = sanitiseFilename(validatedFile.name ?? "payment.pdf");
      const storagePath = `cnt-payment/${cntId}/${safeName}`;
      const bytes = new Uint8Array(await validatedFile.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from("member-docs")
        .upload(storagePath, bytes, {
          contentType: validatedFile.type || "application/pdf",
          upsert:      false,
        });
      if (upErr) {
        // Faithful: legacy doesn't roll back the tb_cnt row on upload
        // failure; we log + continue with cntfile = "".
        await logAdminAction(
          adminId,
          "cnt_payment.upload_failed",
          "tb_cnt",
          String(cntId),
          {
            storage_path: storagePath,
            error:        upErr.message,
          },
        );
      } else {
        filePath = storagePath;
        // Update cntFile column with the relative path.
        const { error: updErr } = await admin
          .from("tb_cnt")
          .update({ cntFile: storagePath })
          .eq("ID", cntId);
        if (updErr) {
          // Audit only — the row is otherwise valid.
          await logAdminAction(
            adminId,
            "cnt_payment.cntfile_update_failed",
            "tb_cnt",
            String(cntId),
            { storage_path: storagePath, error: updErr.message },
          );
        }
      }
    }

    // ── (e) Harvest fIDorCO + fTrackingCHN per cabinet ──
    //   SELECT fIDorCO, fTrackingCHN FROM tb_forwarder
    //   WHERE fCabinetNumber = '<cabinet>'
    // Then bulk-INSERT into tb_cnt_pay_idorco + tb_cnt_pay_trackingchn.
    // (report-cnt.php L60-89 inner loop)
    const { data: forwarderRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("fidorco, ftrackingchn, fcabinetnumber")
      .in("fcabinetnumber", cabinetNumbers);
    if (fwdErr) {
      // Audit-only — the tb_cnt row stands but the fan-out is incomplete.
      await logAdminAction(
        adminId,
        "cnt_payment.forwarder_lookup_failed",
        "tb_cnt",
        String(cntId),
        { error: fwdErr.message, cabinet_numbers: cabinetNumbers },
      );
    }

    const idorcoRows: Array<{ fidorco: string; fcabinetnumber: string }> = [];
    const trackingRows: Array<{
      ftrackingchn: string;
      fcabinetnumber: string;
    }> = [];

    for (const r of (forwarderRows ?? []) as Array<{
      fidorco: string | null;
      ftrackingchn: string | null;
      fcabinetnumber: string;
    }>) {
      // Match legacy null-skip (report-cnt.php L70-71)
      if (r.fidorco) {
        idorcoRows.push({
          fidorco:        r.fidorco,
          fcabinetnumber: r.fcabinetnumber,
        });
      }
      if (r.ftrackingchn) {
        trackingRows.push({
          ftrackingchn:   r.ftrackingchn,
          fcabinetnumber: r.fcabinetnumber,
        });
      }
    }

    if (idorcoRows.length > 0) {
      const { error: idorcoErr } = await admin
        .from("tb_cnt_pay_idorco")
        .insert(idorcoRows);
      if (idorcoErr) {
        await logAdminAction(
          adminId,
          "cnt_payment.idorco_insert_failed",
          "tb_cnt",
          String(cntId),
          { error: idorcoErr.message, rows: idorcoRows.length },
        );
      }
    }

    if (trackingRows.length > 0) {
      const { error: trkErr } = await admin
        .from("tb_cnt_pay_trackingchn")
        .insert(trackingRows);
      if (trkErr) {
        await logAdminAction(
          adminId,
          "cnt_payment.tracking_insert_failed",
          "tb_cnt",
          String(cntId),
          { error: trkErr.message, rows: trackingRows.length },
        );
      }
    }

    // ── (f) Bulk-INSERT tb_cnt_item ──
    //   INSERT INTO tb_cnt_item(fCabinetNumber, cntID) VALUES …
    // The join table — its presence is what makes a cabinet show
    // "จ่ายแล้ว" on the report-cnt list.
    const itemRows = cabinetNumbers.map((cab) => ({
      fCabinetNumber: cab,
      cntID:          cntId,
    }));
    const { error: itemErr } = await admin
      .from("tb_cnt_item")
      .insert(itemRows);
    if (itemErr) {
      await logAdminAction(
        adminId,
        "cnt_payment.item_insert_failed",
        "tb_cnt",
        String(cntId),
        { error: itemErr.message, cabinet_numbers: cabinetNumbers },
      );
      return { ok: false, error: itemErr.message };
    }

    await logAdminAction(adminId, "cnt_payment.create", "tb_cnt", String(cntId), {
      legacy_admin_id: legacyAdminId,
      cabinet_numbers: cabinetNumbers,
      cnt_amount:      cntAmount,
      bank_name:       nameBlank,
      bank_no:         noBlank,
      account_name:    nameAccount,
      file_path:       filePath,
    });

    revalidatePath("/admin/report-cnt");
    revalidatePath("/admin/cnt-hs");
    return {
      ok:   true,
      data: { cntId, cabinetNumbers, filePath },
    };
  });
}

// ────────────────────────────────────────────────────────────
// Helper — sanitise a filename for the storage path. Mirrors
// the conservative rule in actions/bookings.ts `sanitiseFilename`.
// ────────────────────────────────────────────────────────────
function sanitiseFilename(name: string): string {
  return name
    .replace(/[\\/]/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 100);
}
