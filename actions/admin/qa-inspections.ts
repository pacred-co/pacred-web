"use server";

/**
 * P0 #2 — QA/QC inspection admin actions (REBUILT on tb_forwarder spine).
 *
 * The pre-D1 V-E10 module FK'd the retired `cargo_shipments` spine
 * (Wave 3D cleanup, 2026-05-20 ค่ำ). Under D1 (faithful PCS Cargo port)
 * this rebuild keys inspections by `tb_forwarder.id` directly — matching
 * the legacy ตรวจสอบสินค้า workflow per PCS_Cargo_Guidebook_TH.md
 * L441-454 (สีถูกต้อง / ไซส์ถูกต้อง / ของแท้ / Blacklist on fake).
 *
 * Verdict enum:
 *   pass         — ผ่าน (ส่งต่อได้)
 *   fail         — ตก (สี/ไซส์ผิด · ต้องคุยลูกค้า/supplier)
 *   hold         — กักไว้ (รอลูกค้าตัดสินใจ refund/replacement)
 *   fake_product — ของปลอม · ห้ามส่งต่อ · Blacklist (Guidebook L451-454)
 *
 * Photo storage: reuses the existing `member-docs` bucket under
 * `qa-inspections/<inspection_id>/<filename>` (same pattern as
 * actions/admin/cnt-payment.ts cnt-payment PDF upload).
 *
 * Blacklist integration: STUBBED — no `tb_shop` catalogue table exists
 * in migration 0081 (the only `tb_shop_*` tables are shop-payouts, not
 * a shop catalogue). The verdict + blacklist_shop flag are recorded on
 * the inspection row; when the shop catalogue lands, ภูม must wire the
 * propagation (TODO ภูม flagged in 0093 column comment).
 *
 * Auth: withAdmin(["super","ops","warehouse","qa"]) — the QA staff role
 * (added 2026-05-20 ค่ำ migration 0091) plus the warehouse/ops/super
 * roles that can physically inspect arrived goods.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Zod schemas + value enums live OUTSIDE this file — Next.js forbids
// non-async exports from `"use server"` modules. Re-export the TYPES
// here (types are stripped at build time, so they're allowed).
import {
  QA_VERDICTS,
  createQaInspectionSchema,
  updateQaInspectionSchema,
  type QaVerdict,
  type CreateQaInspectionInput,
  type UpdateQaInspectionInput,
} from "@/lib/validators/qa-inspection-rebuilt";
export type {
  QaVerdict,
  CreateQaInspectionInput,
  UpdateQaInspectionInput,
} from "@/lib/validators/qa-inspection-rebuilt";

// ════════════════════════════════════════════════════════════════
// 1) Create QA inspection
// ════════════════════════════════════════════════════════════════

/**
 * Records a new QA inspection for an import job (tb_forwarder row).
 *
 * Fake-product handling: when `verdict='fake_product'`, `blacklist_shop`
 * is force-set to true (matches the DB CHECK constraint
 * `qa_inspections_fake_implies_blacklist`).
 *
 * Returns the new inspection row id.
 */
export async function adminCreateQaInspection(
  input: CreateQaInspectionInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createQaInspectionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { forwarder_f_no, verdict, notes, photo_urls } = parsed.data;
  // fake_product implies blacklist (DB enforces; we set client-side too
  // to keep the round-trip predictable).
  const blacklist_shop = verdict === "fake_product" ? true : !!parsed.data.blacklist_shop;

  return withAdmin<{ id: string }>(
    ["super", "ops", "warehouse", "qa"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // (a) Verify the forwarder exists (avoid FK error surfacing as a
      // confusing "violates foreign key constraint" message to the operator).
      const { data: fwd, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("id, userid, fcabinetnumber")
        .eq("id", forwarder_f_no)
        .maybeSingle<{ id: number; userid: string | null; fcabinetnumber: string | null }>();
      if (fwdErr) return { ok: false, error: fwdErr.message };
      if (!fwd) {
        return {
          ok: false,
          error: `ไม่พบรายการนำเข้าเลขที่ ${forwarder_f_no}`,
        };
      }

      // (b) INSERT the inspection row.
      const { data: row, error: insErr } = await admin
        .from("qa_inspections")
        .insert({
          forwarder_id:       forwarder_f_no,
          inspector_admin_id: adminId,
          verdict,
          notes:              notes ?? null,
          photo_urls:         photo_urls ?? [],
          blacklist_shop,
        })
        .select("id")
        .single<{ id: string }>();
      if (insErr || !row) {
        return { ok: false, error: insErr?.message ?? "insert_failed" };
      }

      // (c) Blacklist propagation — STUBBED.
      //
      // The legacy `tb_shop_pay_h` / `tb_shop_pay_sub` tables in migration
      // 0081 are shop-PAYOUT records, NOT a shop catalogue. There is no
      // canonical `tb_shop` table to mark a vendor as blacklisted. When
      // ภูม / พี่เดฟ add the shop-catalogue table (or a shop_blacklist
      // table), wire propagation here.
      //
      // For now the blacklist_shop boolean lives on the inspection row +
      // is surfaced in the customer's order-form via a TODO query (see
      // STUB note below).
      if (blacklist_shop) {
        await logAdminAction(
          adminId,
          "qa_inspection.blacklist_flag_set",
          "qa_inspections",
          row.id,
          {
            forwarder_f_no,
            fcabinetnumber: fwd.fcabinetnumber,
            userid:         fwd.userid,
            // TODO ภูม: when tb_shop catalogue exists, propagate here:
            //   await admin.from("tb_shop").update({ is_blacklisted: true })
            //     .eq("shop_url", <derived-from-forwarder-items>);
            stub_reason: "no tb_shop catalogue table exists in migration 0081",
          },
        );
      }

      await logAdminAction(
        adminId,
        "qa_inspection.create",
        "qa_inspections",
        row.id,
        {
          forwarder_f_no,
          verdict,
          blacklist_shop,
          photo_count: (photo_urls ?? []).length,
        },
      );

      revalidatePath("/admin/warehouse/qa-inspections");
      revalidatePath(`/admin/forwarders/${forwarder_f_no}`);
      return { ok: true, data: { id: row.id } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 2) Update QA inspection
// ════════════════════════════════════════════════════════════════

export async function adminUpdateQaInspection(
  input: UpdateQaInspectionInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateQaInspectionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { id, verdict, notes } = parsed.data;
  // Same fake_product → blacklist coupling on update.
  const blacklist_shop =
    verdict === "fake_product"
      ? true
      : parsed.data.blacklist_shop;

  return withAdmin<void>(
    ["super", "ops", "warehouse", "qa"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      const patch: Record<string, unknown> = {};
      if (verdict !== undefined)        patch.verdict        = verdict;
      if (notes !== undefined)          patch.notes          = notes;
      if (blacklist_shop !== undefined) patch.blacklist_shop = blacklist_shop;

      const { error: updErr } = await admin
        .from("qa_inspections")
        .update(patch)
        .eq("id", id);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(
        adminId,
        "qa_inspection.update",
        "qa_inspections",
        id,
        patch,
      );

      revalidatePath("/admin/warehouse/qa-inspections");
      revalidatePath(`/admin/warehouse/qa-inspections/${id}`);
      return { ok: true };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 3) List QA inspections (server-loaded · used by the list page)
// ════════════════════════════════════════════════════════════════

export type QaInspectionListRow = {
  id:                 string;
  forwarder_id:       number;
  verdict:            QaVerdict;
  notes:              string | null;
  blacklist_shop:     boolean;
  photo_urls:         string[];
  inspected_at:       string;
  fwd_fcabinetnumber: string | null;
  fwd_userid:         string | null;
  fwd_ftrackingchn:   string | null;
};

export type ListQaInspectionsInput = {
  verdict?: QaVerdict | "all";
  q?:       string;   // f_no / fcabinetnumber / userid / ftrackingchn substring
  limit?:   number;
};

export async function adminListQaInspections(
  input: ListQaInspectionsInput = {},
): Promise<AdminActionResult<QaInspectionListRow[]>> {
  return withAdmin<QaInspectionListRow[]>(
    ["super", "ops", "warehouse", "qa"],
    async () => {
      const admin = createAdminClient();
      const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);

      // 1) Pull the qa_inspections rows (filtered by verdict).
      let q = admin
        .from("qa_inspections")
        .select("id, forwarder_id, verdict, notes, blacklist_shop, photo_urls, inspected_at")
        .order("inspected_at", { ascending: false })
        .limit(limit);
      if (input.verdict && input.verdict !== "all") {
        q = q.eq("verdict", input.verdict);
      }
      const { data: insRows, error: insErr } = await q;
      if (insErr) return { ok: false, error: insErr.message };
      if (!insRows || insRows.length === 0) return { ok: true, data: [] };

      // 2) Hydrate the tb_forwarder rows in one batch lookup.
      const fwdIds = Array.from(new Set(insRows.map((r) => r.forwarder_id as number)));
      const { data: fwdRows, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("id, fcabinetnumber, userid, ftrackingchn")
        .in("id", fwdIds);
      if (fwdErr) return { ok: false, error: fwdErr.message };

      const fwdById = new Map<number, { fcabinetnumber: string | null; userid: string | null; ftrackingchn: string | null }>();
      for (const f of (fwdRows ?? []) as Array<{
        id: number;
        fcabinetnumber: string | null;
        userid: string | null;
        ftrackingchn: string | null;
      }>) {
        fwdById.set(f.id, {
          fcabinetnumber: f.fcabinetnumber,
          userid:         f.userid,
          ftrackingchn:   f.ftrackingchn,
        });
      }

      let merged: QaInspectionListRow[] = insRows.map((r) => {
        const f = fwdById.get(r.forwarder_id as number);
        return {
          id:                 r.id as string,
          forwarder_id:       r.forwarder_id as number,
          verdict:            r.verdict as QaVerdict,
          notes:              (r.notes as string | null) ?? null,
          blacklist_shop:     !!r.blacklist_shop,
          photo_urls:         (r.photo_urls as string[] | null) ?? [],
          inspected_at:       r.inspected_at as string,
          fwd_fcabinetnumber: f?.fcabinetnumber ?? null,
          fwd_userid:         f?.userid ?? null,
          fwd_ftrackingchn:   f?.ftrackingchn ?? null,
        };
      });

      // 3) Free-text filter — match f_no / cabinet / userid / tracking.
      if (input.q && input.q.trim().length > 0) {
        const needle = input.q.trim().toLowerCase();
        merged = merged.filter((r) => {
          return (
            String(r.forwarder_id).toLowerCase().includes(needle)
            || (r.fwd_fcabinetnumber ?? "").toLowerCase().includes(needle)
            || (r.fwd_userid ?? "").toLowerCase().includes(needle)
            || (r.fwd_ftrackingchn ?? "").toLowerCase().includes(needle)
          );
        });
      }

      return { ok: true, data: merged };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 4) Photo upload — into the existing member-docs bucket
// ════════════════════════════════════════════════════════════════

/**
 * Uploads a single photo to `member-docs/qa-inspections/<inspection_id>/<name>`.
 *
 * The caller is responsible for appending the returned storage path to the
 * inspection's `photo_urls` array (via `adminUpdateQaInspection` or as part
 * of the initial `adminCreateQaInspection` call).
 *
 * Caller pattern (from new-inspection-form.tsx):
 *   1. for each file → `adminUploadQaPhoto(file)` → collect paths
 *   2. `adminCreateQaInspection({ ..., photo_urls: collectedPaths })`
 *
 * For an update flow: append to existing array + `adminUpdateQaInspection`.
 */
export async function adminUploadQaPhoto(
  formData: FormData,
): Promise<AdminActionResult<{ storage_path: string }>> {
  return withAdmin<{ storage_path: string }>(
    ["super", "ops", "warehouse", "qa"],
    async ({ adminId }) => {
      const file = formData.get("file");
      const draftKey = (formData.get("draftKey") as string) || "drafts";

      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: "ไม่พบไฟล์รูป" };
      }
      if (file.size > 10 * 1024 * 1024) {
        return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
      }
      const lower = (file.name ?? "").toLowerCase();
      if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(lower)) {
        return { ok: false, error: "อนุญาตเฉพาะไฟล์รูป (jpg/png/webp/heic)" };
      }

      const admin = createAdminClient();
      const safeName = sanitiseFilename(file.name ?? "photo.jpg");
      // The draftKey carries the *eventual* inspection id (when known) or
      // the literal "drafts/<random>" sub-folder during the new-inspection
      // form flow. Each path is unique enough to avoid upload collisions.
      const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `qa-inspections/${draftKey}/${uniq}-${safeName}`;
      const bytes = new Uint8Array(await file.arrayBuffer());

      const { error: upErr } = await admin.storage
        .from("member-docs")
        .upload(storagePath, bytes, {
          contentType: file.type || "image/jpeg",
          upsert:      false,
        });
      if (upErr) {
        await logAdminAction(
          adminId,
          "qa_inspection.photo_upload_failed",
          "storage",
          storagePath,
          { error: upErr.message },
        );
        return { ok: false, error: upErr.message };
      }

      return { ok: true, data: { storage_path: storagePath } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 5) Single-row read — used by the detail page
// ════════════════════════════════════════════════════════════════

export type QaInspectionDetail = QaInspectionListRow & {
  inspector_admin_id: string;
  created_at:         string;
  updated_at:         string;
};

export async function adminGetQaInspection(
  id: string,
): Promise<AdminActionResult<QaInspectionDetail | null>> {
  return withAdmin<QaInspectionDetail | null>(
    ["super", "ops", "warehouse", "qa"],
    async () => {
      const admin = createAdminClient();
      const { data: row, error: insErr } = await admin
        .from("qa_inspections")
        .select("id, forwarder_id, verdict, notes, blacklist_shop, photo_urls, inspected_at, inspector_admin_id, created_at, updated_at")
        .eq("id", id)
        .maybeSingle<{
          id: string;
          forwarder_id: number;
          verdict: QaVerdict;
          notes: string | null;
          blacklist_shop: boolean | null;
          photo_urls: string[] | null;
          inspected_at: string;
          inspector_admin_id: string;
          created_at: string;
          updated_at: string;
        }>();
      if (insErr) return { ok: false, error: insErr.message };
      if (!row) return { ok: true, data: null };

      const { data: fwd, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("fcabinetnumber, userid, ftrackingchn")
        .eq("id", row.forwarder_id)
        .maybeSingle<{ fcabinetnumber: string | null; userid: string | null; ftrackingchn: string | null }>();
      if (fwdErr) {
        console.error(`[tb_forwarder list] failed`, { code: fwdErr.code, message: fwdErr.message });
      }

      return {
        ok: true,
        data: {
          id:                 row.id,
          forwarder_id:       row.forwarder_id,
          verdict:            row.verdict,
          notes:              row.notes ?? null,
          blacklist_shop:     !!row.blacklist_shop,
          photo_urls:         row.photo_urls ?? [],
          inspected_at:       row.inspected_at,
          fwd_fcabinetnumber: fwd?.fcabinetnumber ?? null,
          fwd_userid:         fwd?.userid ?? null,
          fwd_ftrackingchn:   fwd?.ftrackingchn ?? null,
          inspector_admin_id: row.inspector_admin_id,
          created_at:         row.created_at,
          updated_at:         row.updated_at,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 6) Signed-URL helper — for photo gallery render
// ════════════════════════════════════════════════════════════════

export async function adminQaPhotoSignedUrls(
  paths: string[],
  expirySeconds: number = 600,
): Promise<AdminActionResult<Record<string, string>>> {
  return withAdmin<Record<string, string>>(
    ["super", "ops", "warehouse", "qa"],
    async () => {
      if (paths.length === 0) return { ok: true, data: {} };
      const admin = createAdminClient();
      const out: Record<string, string> = {};
      // Supabase Storage createSignedUrls accepts a batched array.
      const { data, error } = await admin.storage
        .from("member-docs")
        .createSignedUrls(paths, expirySeconds);
      if (error) return { ok: false, error: error.message };
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
      }
      return { ok: true, data: out };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 7) Billing-gate consumer — V-E7 freight-invoice gate hook
// ════════════════════════════════════════════════════════════════

/**
 * Returns true if the given import job (tb_forwarder.id) has a `pass`
 * verdict on its LATEST QA inspection.
 *
 * V-E7 freight invoicing (when revived) must consult this before issuing
 * a freight_invoice. Forwarder jobs with `fake_product` / `fail` / `hold`
 * verdicts (or no inspection at all) are blocked.
 *
 * Replaces the legacy `isCargoShipmentQaPassed(uuid)` stub which always
 * returned false (no `cargo_shipments` table after Wave 3D drop).
 */
export async function isForwarderQaPassed(forwarder_f_no: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("qa_inspections")
    .select("verdict")
    .eq("forwarder_id", forwarder_f_no)
    .order("inspected_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ verdict: string }>();
  if (error || !data) return false;
  return data.verdict === "pass";
}

// ────────────────────────────────────────────────────────────
// Helper — sanitise a filename for the storage path. Mirrors
// the conservative rule in actions/admin/cnt-payment.ts.
// ────────────────────────────────────────────────────────────
function sanitiseFilename(name: string): string {
  return name
    .replace(/[\\/]/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 100);
}
