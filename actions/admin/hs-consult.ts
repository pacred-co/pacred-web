"use server";

// ════════════════════════════════════════════════════════════════════
// G1 — ad-hoc PRE-ORDER HS/พิกัด consult ticket.
//
// The #1 daily Doc-team task (operational-flow §8 G1): a Sale/CS posts a
// product PHOTO + Thai name → the Doc role replies with the HS code, อากร%,
// ฟอร์มอี%, รหัสสถิติ, "ออกใบกำกับได้ไหม", and the เลี่ยงพิกัด / license intel —
// all BEFORE an order exists. The order-bound hs-triage (actions/admin/
// hs-triage.ts) only assigns พิกัด onto EXISTING order lines, so it can't carry
// this pre-order request/answer loop.
//
// REUSE-SEARCH: the submit form + the Doc answer panel call searchHsCodes over
// the คลัง HS dictionary (124 rows) so a known answer is found instantly →
// Doc one-clicks instead of re-answering.
// GROW-LIBRARY: on answer, an optional "บันทึกเข้าคลัง HS" calls upsertHsCode so
// the dictionary the search reads gets enriched — a virtuous loop. The hs_note
// is COMPOSED from the เลี่ยง block in the exact shape mig 0224 already stores.
//
// ⚠️ ISOLATION (§0e): this is reference/consult data. It NEVER writes a selling
// price / cost / order / a declaration's persisted duty. The only cross-table
// write is the OPTIONAL upsertHsCode into the (already reference-only) hs_codes
// dictionary.
// ════════════════════════════════════════════════════════════════════

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { upsertHsCode } from "./hs-codes";
import type { AdminRole } from "@/lib/auth/require-admin";

// ── RBAC (matches the Sale/CS↔Doc chat pattern + the existing role families) ──
// SUBMIT = the Sale/CS lane (ultra/super god via isGodRole in requireAdmin).
const ROLES_SUBMIT: AdminRole[] = ["super", "ultra", "sales", "sales_admin", "ops"];
// ANSWER = the Doc / pricing / accounting authority lane.
const ROLES_ANSWER: AdminRole[] = [
  "super",
  "ultra",
  "freight_import_doc",
  "freight_clearance_both",
  "pricing",
  "accounting",
  "ops",
];
// AUDIT = senior approval (AUDIT DOC ~Win) — sets policy/risk calls.
const ROLES_AUDIT: AdminRole[] = ["super", "ultra", "manager"];
// READ = union of all the above (everyone who touches the workflow).
const ROLES_READ: AdminRole[] = [
  ...new Set<AdminRole>([...ROLES_SUBMIT, ...ROLES_ANSWER, ...ROLES_AUDIT]),
];

// Storage: reuse the member-docs bucket under hs-consult/<key>/<file>.
const PHOTO_BUCKET = "member-docs";
const PHOTO_PREFIX = "hs-consult";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const LICENSE_FLAG_VALUES = ["มอก", "อย", "ใบอนุญาต", "ทุ่มตลาด", "เกษตร", "DG"] as const;

// ════════════════════════════════════════════════════════════════════
// Types (export type only — stripped at build · safe on a "use server" file)
// ════════════════════════════════════════════════════════════════════
export type HsConsultStatus = "open" | "answered" | "audit_confirmed" | "cancelled";

export type HsConsultTicket = {
  id: string;
  product_name_th: string;
  product_name_en: string | null;
  qty: string | null;
  request_note: string | null;
  photo_keys: string[];
  submitted_by: string;
  status: HsConsultStatus;
  hs_code: string | null;
  duty_pct: number | null;
  form_e_pct: number | null;
  stat_code: string | null;
  can_issue_tax_invoice: boolean | null;
  answer_note: string | null;
  is_evaded: boolean;
  original_restricted_item: string | null;
  license_flags: string[];
  answered_by: string | null;
  answered_at: string | null;
  audited_by: string | null;
  audited_at: string | null;
  created_at: string;
  updated_at: string;
  /** Resolved signed URLs for photo_keys (best-effort · expires). */
  photo_urls: string[];
};

// ════════════════════════════════════════════════════════════════════
// list
// ════════════════════════════════════════════════════════════════════
const listSchema = z.object({
  filter: z.enum(["open", "answered", "audit_confirmed", "cancelled", "all"]).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

const escLike = (s: string) => s.replace(/[%_,()]/g, (m) => `\\${m}`);

/**
 * The consult queue. `filter` narrows by status (default 'open' so the Doc team
 * sees รอตอบ first; 'all' shows everything); `search` matches the TH/EN product
 * name OR the answered HS code (ILIKE, escaped). Newest-first, bounded. Resolves
 * each row's photo signed URLs best-effort. §0c: every query destructures error.
 */
export async function listHsConsultTickets(opts?: {
  filter?: HsConsultStatus | "all";
  search?: string;
  limit?: number;
}): Promise<AdminActionResult<HsConsultTicket[]>> {
  const parsed = listSchema.safeParse(opts ?? {});
  const filter = parsed.success ? parsed.data.filter ?? "open" : "open";
  const search = parsed.success ? (parsed.data.search ?? "").trim() : "";
  const cap = parsed.success ? parsed.data.limit ?? 150 : 150;

  return withAdmin([...ROLES_READ], async () => {
    const admin = createAdminClient();
    let query = admin
      .from("hs_consult_ticket")
      .select(
        "id, product_name_th, product_name_en, qty, request_note, photo_keys, submitted_by, status, hs_code, duty_pct, form_e_pct, stat_code, can_issue_tax_invoice, answer_note, is_evaded, original_restricted_item, license_flags, answered_by, answered_at, audited_by, audited_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(cap);

    if (filter !== "all") query = query.eq("status", filter);
    if (search) {
      const safe = escLike(search);
      query = query.or(
        `product_name_th.ilike.%${safe}%,product_name_en.ilike.%${safe}%,hs_code.ilike.%${safe}%`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("[hs_consult_ticket list]", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    // Resolve signed URLs for all photo keys in one batch.
    const allKeys = [
      ...new Set(
        rows.flatMap((r) => ((r.photo_keys as string[] | null) ?? [])),
      ),
    ];
    const urlByKey = new Map<string, string>();
    if (allKeys.length > 0) {
      const { data: signed, error: sErr } = await admin.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(allKeys, 600);
      if (sErr) {
        console.error("[hs_consult_ticket signed urls]", { message: sErr.message });
      }
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) urlByKey.set(item.path, item.signedUrl);
      }
    }

    const tickets: HsConsultTicket[] = rows.map((r) => {
      const keys = ((r.photo_keys as string[] | null) ?? []);
      return {
        id: r.id as string,
        product_name_th: (r.product_name_th as string) ?? "",
        product_name_en: (r.product_name_en as string | null) ?? null,
        qty: (r.qty as string | null) ?? null,
        request_note: (r.request_note as string | null) ?? null,
        photo_keys: keys,
        submitted_by: (r.submitted_by as string) ?? "",
        status: (r.status as HsConsultStatus) ?? "open",
        hs_code: (r.hs_code as string | null) ?? null,
        duty_pct: r.duty_pct == null ? null : Number(r.duty_pct),
        form_e_pct: r.form_e_pct == null ? null : Number(r.form_e_pct),
        stat_code: (r.stat_code as string | null) ?? null,
        can_issue_tax_invoice: (r.can_issue_tax_invoice as boolean | null) ?? null,
        answer_note: (r.answer_note as string | null) ?? null,
        is_evaded: !!r.is_evaded,
        original_restricted_item: (r.original_restricted_item as string | null) ?? null,
        license_flags: ((r.license_flags as string[] | null) ?? []),
        answered_by: (r.answered_by as string | null) ?? null,
        answered_at: (r.answered_at as string | null) ?? null,
        audited_by: (r.audited_by as string | null) ?? null,
        audited_at: (r.audited_at as string | null) ?? null,
        created_at: (r.created_at as string) ?? "",
        updated_at: (r.updated_at as string) ?? "",
        photo_urls: keys.map((k) => urlByKey.get(k)).filter((u): u is string => !!u),
      };
    });

    return { ok: true, data: tickets };
  });
}

// ════════════════════════════════════════════════════════════════════
// photo upload
// ════════════════════════════════════════════════════════════════════
function sanitiseFilename(name: string): string {
  return name
    .replace(/[\\/]/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 100);
}

/**
 * Upload ONE product photo into member-docs/hs-consult/<draftKey>/<uniq>-<name>.
 * The caller collects the returned storage key + passes the array in
 * createHsConsultTicket. Same shape as adminUploadQaPhoto (10MB · image only).
 */
export async function adminUploadHsConsultPhoto(
  formData: FormData,
): Promise<AdminActionResult<{ storage_path: string }>> {
  return withAdmin([...ROLES_SUBMIT], async ({ adminId }) => {
    const file = formData.get("file");
    const draftKey = (formData.get("draftKey") as string) || "drafts";

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "ไม่พบไฟล์รูป" };
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB" };
    }
    const lower = (file.name ?? "").toLowerCase();
    if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(lower)) {
      return { ok: false, error: "อนุญาตเฉพาะไฟล์รูป (jpg/png/webp/heic)" };
    }

    const admin = createAdminClient();
    const safeName = sanitiseFilename(file.name ?? "photo.jpg");
    const safeKey = sanitiseFilename(String(draftKey)) || "drafts";
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${PHOTO_PREFIX}/${safeKey}/${uniq}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type || "image/jpeg", upsert: false });
    if (upErr) {
      await logAdminAction(adminId, "hs_consult.photo_upload_failed", "storage", storagePath, {
        error: upErr.message,
      });
      return { ok: false, error: upErr.message };
    }
    return { ok: true, data: { storage_path: storagePath } };
  });
}

/** Resolve signed URLs for a set of stored photo keys (gallery render). */
export async function resolveHsConsultPhotoUrls(
  keys: string[],
  expirySeconds = 600,
): Promise<AdminActionResult<Record<string, string>>> {
  return withAdmin([...ROLES_READ], async () => {
    if (!keys || keys.length === 0) return { ok: true, data: {} };
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(keys, expirySeconds);
    if (error) return { ok: false, error: error.message };
    const out: Record<string, string> = {};
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
    }
    return { ok: true, data: out };
  });
}

// ════════════════════════════════════════════════════════════════════
// create (Sale/CS)
// ════════════════════════════════════════════════════════════════════
const createSchema = z.object({
  product_name_th: z.string().trim().min(1, "กรอกชื่อสินค้า (ไทย)").max(300),
  product_name_en: z.string().trim().max(300).optional(),
  qty: z.string().trim().max(100).optional(),
  request_note: z.string().trim().max(2000).optional(),
  photo_keys: z.array(z.string().trim().max(300)).max(20).optional(),
});

export async function createHsConsultTicket(
  input: z.infer<typeof createSchema>,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_SUBMIT], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("hs_consult_ticket")
      .insert({
        product_name_th: d.product_name_th,
        product_name_en: d.product_name_en ?? null,
        qty: d.qty ?? null,
        request_note: d.request_note ?? null,
        photo_keys: d.photo_keys ?? [],
        submitted_by: adminId,
        status: "open",
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !row) {
      console.error("[hs_consult_ticket insert]", { code: error?.code, message: error?.message });
      return { ok: false, error: error?.message ?? "insert_failed" };
    }

    await logAdminAction(adminId, "hs_consult.create", "hs_consult_ticket", row.id, {
      product_name_th: d.product_name_th,
      photo_count: (d.photo_keys ?? []).length,
    });
    revalidatePath("/admin/accounting/hs-consult");
    return { ok: true, data: { id: row.id } };
  });
}

// ════════════════════════════════════════════════════════════════════
// answer (Doc / pricing / accounting) + optional grow-library
// ════════════════════════════════════════════════════════════════════
const pct = z.coerce.number().min(0).max(100);
const answerSchema = z.object({
  id: z.string().uuid(),
  hs_code: z.string().trim().min(1, "กรอกเลข HS").max(40),
  duty_pct: pct.optional(),
  form_e_pct: pct.optional(),
  stat_code: z.string().trim().max(10).optional(),
  can_issue_tax_invoice: z.boolean().optional(),
  answer_note: z.string().trim().max(2000).optional(),
  // เลี่ยงพิกัด block
  is_evaded: z.boolean().optional(),
  original_restricted_item: z.string().trim().max(300).optional(),
  license_flags: z.array(z.enum(LICENSE_FLAG_VALUES)).max(LICENSE_FLAG_VALUES.length).optional(),
  // grow the คลัง HS dictionary from this answer?
  save_to_library: z.boolean().optional(),
});

/**
 * Compose the hs_note exactly as mig 0224 stores it — so a grown row enriches
 * the same dictionary searchHsCodes reads. When เลี่ยง:
 *   "เลี่ยงพิกัด: <จริงคืออะไร> (ติด <flags>) → <hs> · <note> · ออกใบกำกับ: ได้/ไม่ได้"
 */
function composeHsNote(d: z.infer<typeof answerSchema>): string {
  const parts: string[] = [];
  if (d.is_evaded) {
    const flags = (d.license_flags ?? []).join("/");
    const orig = (d.original_restricted_item ?? "").trim();
    let head = "เลี่ยงพิกัด:";
    if (orig) head += ` ${orig}`;
    if (flags) head += ` (ติด ${flags})`;
    head += ` → ${d.hs_code}`;
    parts.push(head);
  }
  const note = (d.answer_note ?? "").trim();
  if (note) parts.push(note);
  if (d.can_issue_tax_invoice != null) {
    parts.push(`ออกใบกำกับ: ${d.can_issue_tax_invoice ? "ได้" : "ไม่ได้"}`);
  }
  return parts.join(" · ");
}

export async function answerHsConsultTicket(
  input: z.infer<typeof answerSchema>,
): Promise<AdminActionResult<{ grewLibrary: boolean }>> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const stat = (d.stat_code ?? "").trim() || null;

  return withAdmin([...ROLES_ANSWER], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing, error: exErr } = await admin
      .from("hs_consult_ticket")
      .select("id, status, product_name_th, product_name_en")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; product_name_th: string; product_name_en: string | null }>();
    if (exErr) {
      console.error("[answerHsConsultTicket lookup]", { code: exErr.code, message: exErr.message });
      return { ok: false, error: `db_error:${exErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === "cancelled") {
      return { ok: false, error: "ตั๋วนี้ถูกยกเลิกแล้ว ตอบไม่ได้" };
    }

    const { error: updErr } = await admin
      .from("hs_consult_ticket")
      .update({
        hs_code: d.hs_code,
        duty_pct: d.duty_pct ?? null,
        form_e_pct: d.form_e_pct ?? null,
        stat_code: stat,
        can_issue_tax_invoice: d.can_issue_tax_invoice ?? null,
        answer_note: d.answer_note ?? null,
        is_evaded: d.is_evaded ?? false,
        original_restricted_item: d.original_restricted_item ?? null,
        license_flags: d.license_flags ?? [],
        answered_by: adminId,
        answered_at: new Date().toISOString(),
        // answering keeps audit_confirmed if it was already audited; otherwise → answered.
        status: existing.status === "audit_confirmed" ? "audit_confirmed" : "answered",
      })
      .eq("id", d.id);
    if (updErr) {
      console.error("[answerHsConsultTicket update]", { code: updErr.code, message: updErr.message });
      return { ok: false, error: `บันทึกคำตอบไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "hs_consult.answer", "hs_consult_ticket", d.id, {
      hs_code: d.hs_code,
      is_evaded: d.is_evaded ?? false,
      save_to_library: !!d.save_to_library,
    });

    // GROW-LIBRARY (optional · reference-only upsert into hs_codes · §0e).
    let grewLibrary = false;
    if (d.save_to_library) {
      // NON-DESTRUCTIVE enrich (NEEDS_FIX 2026-06-29 · §0e): upsertHsCode
      // overwrites on conflict, so a consult answer must NOT clobber a curated
      // hs_codes row with a blank — duty snapshots into container_hs_lines, so a
      // blank-อากร answer resetting a curated 20%→0 would mis-hint a later
      // declaration. Read the existing row + merge: the answer wins ONLY for the
      // fields it actually supplied; blanks keep the curated value.
      const { data: cur } = await admin
        .from("hs_codes")
        .select("description, description_en, default_duty_pct, form_e_duty_pct, default_stat_code, hs_note")
        .eq("code", d.hs_code)
        .maybeSingle<{
          description: string | null;
          description_en: string | null;
          default_duty_pct: number | string | null;
          form_e_duty_pct: number | string | null;
          default_stat_code: string | null;
          hs_note: string | null;
        }>();
      const curDuty = cur?.default_duty_pct == null ? null : Number(cur.default_duty_pct);
      const curFe = cur?.form_e_duty_pct == null ? null : Number(cur.form_e_duty_pct);
      const res = await upsertHsCode({
        code: d.hs_code,
        // keep a curated description; only set it when the row is new/blank
        description: (cur?.description?.trim() || existing.product_name_th || d.hs_code),
        description_en: existing.product_name_en ?? cur?.description_en ?? undefined,
        // duty/form-e: the answer wins only when supplied; blank keeps curated (never reset to 0)
        default_duty_pct: d.duty_pct ?? curDuty ?? 0,
        form_e_duty_pct: d.form_e_pct ?? curFe ?? undefined,
        default_stat_code: stat ?? cur?.default_stat_code ?? undefined,
        // note: fill-blank-only (don't clobber a curated note)
        hs_note: (cur?.hs_note?.trim() ? cur.hs_note : (composeHsNote(d) || undefined)),
      });
      grewLibrary = res.ok;
      if (!res.ok) {
        // Non-fatal: the answer is saved; only the library enrichment failed.
        console.error("[answerHsConsultTicket grow-library]", { error: res.error });
      }
    }

    revalidatePath("/admin/accounting/hs-consult");
    revalidatePath("/admin/accounting/hs-library");
    return { ok: true, data: { grewLibrary } };
  });
}

// ════════════════════════════════════════════════════════════════════
// audit confirm (senior) + cancel
// ════════════════════════════════════════════════════════════════════
const idSchema = z.object({ id: z.string().uuid() });

export async function auditConfirmHsConsultTicket(
  input: { id: string },
): Promise<AdminActionResult<void>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_AUDIT], async ({ adminId }) => {
    const admin = createAdminClient();
    // Only an answered ticket can be audit-confirmed (TOCTOU-folded into WHERE).
    const { data: rows, error } = await admin
      .from("hs_consult_ticket")
      .update({ status: "audit_confirmed", audited_by: adminId, audited_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("status", "answered")
      .select("id");
    if (error) {
      console.error("[auditConfirmHsConsultTicket]", { code: error.code, message: error.message });
      return { ok: false, error: `ยืนยันไม่สำเร็จ: ${error.message}` };
    }
    if (!rows || rows.length === 0) {
      return { ok: false, error: "ต้องตอบพิกัดก่อนจึงจะยืนยัน (audit) ได้" };
    }
    await logAdminAction(adminId, "hs_consult.audit_confirm", "hs_consult_ticket", parsed.data.id);
    revalidatePath("/admin/accounting/hs-consult");
    return { ok: true };
  });
}

export async function cancelHsConsultTicket(
  input: { id: string },
): Promise<AdminActionResult<void>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_SUBMIT, ...ROLES_AUDIT], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("hs_consult_ticket")
      .update({ status: "cancelled" })
      .eq("id", parsed.data.id)
      .neq("status", "cancelled");
    if (error) {
      console.error("[cancelHsConsultTicket]", { code: error.code, message: error.message });
      return { ok: false, error: `ยกเลิกไม่สำเร็จ: ${error.message}` };
    }
    await logAdminAction(adminId, "hs_consult.cancel", "hs_consult_ticket", parsed.data.id);
    revalidatePath("/admin/accounting/hs-consult");
    return { ok: true };
  });
}
