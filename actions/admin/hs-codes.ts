"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/auth/require-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * Admin actions for P-20 — HS codes dictionary + per-container line items.
 *
 *   addHsLine          — push a new line into container_hs_lines
 *   updateHsLine       — edit qty/weight/value/note of an existing line
 *   deleteHsLine       — remove a line
 *   upsertHsCode       — admin manages the hs_codes dictionary (คลัง HS)
 *   listHsCodes        — read the dictionary (search box · CRUD page)
 *   lookupHsCode       — read one code's duty (cost-editor reference hint)
 */

// Roles that may manage / read the คลัง HS dictionary (mirror the
// cargo-taxdoc-workspace ROLES so the same people who touch the 3-number /
// ใบขน flow can maintain the duty reference).
const HS_LIBRARY_ROLES: AdminRole[] = [
  "super",
  "accounting",
  "pricing",
  "freight_import_doc",
  "freight_clearance_both",
];

// The reference duty HINT (lookupHsCode) is a read-only dictionary lookup with
// no money write, surfaced in BOTH the Pricing cost editor AND the CS HS-triage
// queue. CS-lane roles (sales/sales_admin/ops · GAP 5) must reach the hint or
// it silently role-fails for the exact users entering the HS. Read-only widen.
const HS_LOOKUP_ROLES: AdminRole[] = [
  ...HS_LIBRARY_ROLES,
  "sales",
  "sales_admin",
  "ops",
];

// ────────────────────────────────────────────────────────────
// container_hs_lines
// ────────────────────────────────────────────────────────────
const addLineSchema = z.object({
  container_id:  z.string().uuid(),
  hs_code:       z.string().trim().min(1).max(20),
  qty:           z.number().nonnegative(),
  weight_kg:     z.number().nonnegative(),
  value_thb:     z.number().nonnegative(),
  duty_pct_used: z.number().min(0).max(100).optional(),
  note:          z.string().trim().max(500).optional(),
});
export type AddHsLineInput = z.infer<typeof addLineSchema>;

export async function addHsLine(input: AddHsLineInput): Promise<AdminActionResult<{ id: string }>> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Snapshot the rate at line entry if not explicitly given.
    //
    // 0258 — the "hs_code_not_found" hard-reject used to fire constantly: the
    // dictionary held only 133 codes while HS is free-typed upstream. The
    // 2026-07-16 unification took it to ~1,718, so a real code now resolves.
    // duty_confirmed is read so an UNCONFIRMED placeholder is not snapshotted
    // as if it were a verified rate (0 = ไม่ทราบ, not ยกเว้น).
    let dutyPct = d.duty_pct_used;
    if (dutyPct === undefined) {
      const { data: hs, error: hsErr } = await admin
        .from("hs_codes")
        .select("default_duty_pct, duty_confirmed")
        .eq("code", d.hs_code)
        .maybeSingle<{ default_duty_pct: number; duty_confirmed: boolean | null }>();
      if (hsErr) {
        console.error(`[hs_codes mutation lookup] failed`, { code: hsErr.code, message: hsErr.message });
        return { ok: false, error: `db_error:${hsErr.code ?? "unknown"}` };
      }
      if (!hs) return { ok: false, error: "hs_code_not_found" };
      dutyPct = Number(hs.default_duty_pct);
      if (hs.duty_confirmed !== true) {
        console.warn("[hs_line.add] snapshotted an UNCONFIRMED duty — verify in คลัง HS", {
          hs_code: d.hs_code, duty_pct_used: dutyPct, container_id: d.container_id,
        });
      }
    }

    const { data: row, error } = await admin
      .from("container_hs_lines")
      .insert({
        container_id:  d.container_id,
        hs_code:       d.hs_code,
        qty:           d.qty,
        weight_kg:     d.weight_kg,
        value_thb:     d.value_thb,
        duty_pct_used: dutyPct,
        note:          d.note ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !row) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "hs_line.add", "container_hs_lines", row.id, d);

    revalidatePath(`/admin/containers/${d.container_id}/hs`);
    revalidatePath(`/admin/containers/${d.container_id}`);
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true, data: { id: row.id } };
  });
}

const updateLineSchema = z.object({
  id:            z.string().uuid(),
  qty:           z.number().nonnegative().optional(),
  weight_kg:     z.number().nonnegative().optional(),
  value_thb:     z.number().nonnegative().optional(),
  duty_pct_used: z.number().min(0).max(100).optional(),
  note:          z.string().trim().max(500).optional().nullable(),
});
export type UpdateHsLineInput = z.infer<typeof updateLineSchema>;

export async function updateHsLine(input: UpdateHsLineInput): Promise<AdminActionResult> {
  const parsed = updateLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, ...fields } = parsed.data;

  return withAdmin(["ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: beforeErr } = await admin
      .from("container_hs_lines")
      .select("id, container_id")
      .eq("id", id)
      .maybeSingle<{ id: string; container_id: string }>();
    if (beforeErr) {
      console.error(`[container_hs_lines mutation lookup] failed`, { code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: `db_error:${beforeErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = {};
    if (fields.qty           !== undefined) update.qty           = fields.qty;
    if (fields.weight_kg     !== undefined) update.weight_kg     = fields.weight_kg;
    if (fields.value_thb     !== undefined) update.value_thb     = fields.value_thb;
    if (fields.duty_pct_used !== undefined) update.duty_pct_used = fields.duty_pct_used;
    if (fields.note          !== undefined) update.note          = fields.note;

    const { error } = await admin.from("container_hs_lines").update(update).eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "hs_line.update", "container_hs_lines", id, update);
    revalidatePath(`/admin/containers/${before.container_id}/hs`);
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true };
  });
}

const deleteLineSchema = z.object({ id: z.string().uuid() });

export async function deleteHsLine(
  input: z.infer<typeof deleteLineSchema>,
): Promise<AdminActionResult> {
  const parsed = deleteLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: beforeErr } = await admin
      .from("container_hs_lines")
      .select("id, container_id, hs_code")
      .eq("id", parsed.data.id)
      .maybeSingle<{ id: string; container_id: string; hs_code: string }>();
    if (beforeErr) {
      console.error(`[container_hs_lines mutation lookup] failed`, { code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: `db_error:${beforeErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "not_found" };

    const { error } = await admin.from("container_hs_lines").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "hs_line.delete", "container_hs_lines", parsed.data.id, {
      container_id: before.container_id,
      hs_code:      before.hs_code,
    });
    revalidatePath(`/admin/containers/${before.container_id}/hs`);
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// hs_codes dictionary
// ────────────────────────────────────────────────────────────
// other_forms (อื่นๆ preferential forms): a {"<formName>": <pct>} map.
// Each value is a duty % in [0, 100]; empty form names are dropped.
const otherFormsSchema = z
  .record(z.string(), z.number().min(0).max(100))
  .optional();

const upsertHsCodeSchema = z.object({
  code:             z.string().trim().min(1).max(20),
  description:      z.string().trim().min(1).max(300),
  description_en:   z.string().trim().max(300).optional(),
  default_duty_pct: z.number().min(0).max(100),
  // 0180 — Form-E / ACFTA + other preferential forms + a freeform note.
  form_e_duty_pct:  z.number().min(0).max(100).optional(),
  other_forms:      otherFormsSchema,
  hs_note:          z.string().trim().max(1000).optional(),
  // 0181 — the usual รหัสสถิติ (Thai tariff stat suffix · default "000").
  default_stat_code: z.string().trim().max(10).optional(),
  unit:             z.string().trim().max(20).optional(),
  note:             z.string().trim().max(500).optional(),
  is_active:        z.boolean().optional(),
  // 0258 — does this write ASSERT the duty is real?
  // Defaults to TRUE because the คลัง HS form's whole purpose is a human with
  // the HS role typing a verified rate. A programmatic caller that may be
  // passing a fallback/blank (e.g. the hs-consult grow-library path, where
  // `default_duty_pct: d.duty_pct ?? curDuty ?? 0` can land a 0 nobody
  // asserted) MUST pass false — otherwise an unknown 0 would be stamped
  // "ยืนยันแล้ว" and read as ยกเว้นอากร by every duty consumer.
  duty_confirmed:   z.boolean().optional(),
});
export type UpsertHsCodeInput = z.infer<typeof upsertHsCodeSchema>;

export async function upsertHsCode(input: UpsertHsCodeInput): Promise<AdminActionResult> {
  const parsed = upsertHsCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...HS_LIBRARY_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const confirmed = d.duty_confirmed ?? true;
    const payload: Record<string, unknown> = {
      code:             d.code,
      description:      d.description,
      default_duty_pct: d.default_duty_pct,
      // 0258 — a human with the คลัง HS role typing a duty IS the confirmation:
      // it is how an imported doc-bot guess / an unknown 0 graduates to a
      // trusted rate (and how a wrong ใบขน-derived rate gets corrected).
      // An unconfirmed write keeps provenance as-is rather than laundering a
      // guess into "curated".
      duty_confirmed:   confirmed,
      updated_by:       adminId,
      updated_at:       new Date().toISOString(),
    };
    if (confirmed) payload.provenance = "curated";
    if (d.description_en   !== undefined) payload.description_en   = d.description_en;
    if (d.form_e_duty_pct  !== undefined) payload.form_e_duty_pct  = d.form_e_duty_pct;
    if (d.default_stat_code !== undefined) payload.default_stat_code = d.default_stat_code;
    if (d.other_forms     !== undefined) {
      // Drop empty/whitespace form names so the map stays clean.
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(d.other_forms)) {
        const name = k.trim();
        if (name) cleaned[name] = v;
      }
      payload.other_forms = cleaned;
    }
    if (d.hs_note        !== undefined) payload.hs_note        = d.hs_note;
    if (d.unit           !== undefined) payload.unit           = d.unit;
    if (d.note           !== undefined) payload.note           = d.note;
    if (d.is_active      !== undefined) payload.is_active      = d.is_active;

    const { error } = await admin
      .from("hs_codes")
      .upsert(payload, { onConflict: "code" });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "hs_code.upsert", "hs_codes", d.code, payload);
    // NB: the old revalidatePath("/admin/hs-codes") was a no-op — that route does
    // not exist (the library lives under /admin/accounting/hs-library).
    revalidatePath("/admin/accounting/hs-library");
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// คลัง HS — read actions (CRUD page list + cost-editor lookup hint)
// ────────────────────────────────────────────────────────────

export type HsCodeListRow = {
  code:             string;
  description:      string;
  description_en:   string | null;
  default_duty_pct: number;
  form_e_duty_pct:  number;
  other_forms:      Record<string, number> | null;
  unit:             string | null;
  hs_note:          string | null;
  note:             string | null;
  default_stat_code: string | null;
  is_active:        boolean;
  // ── 0258 · the unified คลัง HS CODE LIBRARY ──
  source:           string | null;   // doc_bot | ไฟล์:nnb | ใบขน | curated
  provenance:       string | null;   // curated_0224 | dummy_0030 | doc_bot | decl
  is_canonical:     boolean;
  duty_confirmed:   boolean;         // false = the duty is a placeholder/guess (0 ≠ exempt)
  decl_count:       number;          // ใช้จริงกี่ใบขน (DISTINCT ref_no)
  decl_duty_pct:    number | null;   // อากรจริงบนใบขน — modal @ priv=000
  decl_form_e_pct:  number | null;   // Form-E จริง — modal @ priv=ACN
  decl_duty_stable: boolean | null;  // false = >1 duty seen within priv=000
  decl_last_used:   string | null;   // ref_no ของใบขนล่าสุดที่ใช้พิกัดนี้
  hs8_is_padded:    boolean;         // key came from zero-padding a <8-digit heading
};

// The FULL field set. Kept as one constant because a lighter projection is a
// live trap: the edit form round-trips whatever it reads, so a row fetched
// without other_forms/hs_note would SAVE them blank and WIPE the stored values.
// The 0258 columns join that contract — read them everywhere the row is read.
const HS_FULL_SELECT =
  "code, description, description_en, default_duty_pct, form_e_duty_pct, other_forms, " +
  "unit, hs_note, note, default_stat_code, is_active, source, provenance, is_canonical, " +
  "duty_confirmed, decl_count, decl_duty_pct, decl_form_e_pct, decl_duty_stable, " +
  "decl_last_used, hs8_is_padded";

const listSchema = z.object({ search: z.string().trim().max(100).optional() });

/**
 * List the hs_codes dictionary for the unified คลัง HS CODE LIBRARY page.
 * Optional `search` filters by code OR description (ILIKE).
 *
 * ⚠️ CAP: the library is ~1,718 rows after the 2026-07-16 unification (was 133).
 * The old 200 cap would silently TRUNCATE it — the page filters client-side, so
 * a truncated read is an invisible wrong answer. 3000 covers the library with
 * headroom; the client render-caps for responsiveness.
 * Reference read — gated to the คลัง HS roles. §0c: error destructured.
 */
export async function listHsCodes(
  search?: string,
): Promise<AdminActionResult<HsCodeListRow[]>> {
  const parsed = listSchema.safeParse({ search });
  const term = parsed.success ? parsed.data.search?.trim() : undefined;

  return withAdmin([...HS_LIBRARY_ROLES], async () => {
    const admin = createAdminClient();
    let query = admin
      .from("hs_codes")
      .select(HS_FULL_SELECT)
      .order("code", { ascending: true })
      .limit(3000);

    if (term) {
      // Escape ILIKE wildcards/commas in the user term so they're literal.
      const safe = term.replace(/[%_,]/g, (m) => `\\${m}`);
      query = query.or(`code.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[hs_codes list]", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    const rows = ((data ?? []) as unknown) as HsCodeListRow[];
    return { ok: true, data: rows.map(normalizeHsRow) };
  });
}

/** Postgres numerics arrive as strings over PostgREST — coerce once, centrally. */
function normalizeHsRow(r: HsCodeListRow): HsCodeListRow {
  return {
    ...r,
    default_duty_pct: Number(r.default_duty_pct),
    form_e_duty_pct:  Number(r.form_e_duty_pct),
    decl_count:       Number(r.decl_count ?? 0),
    decl_duty_pct:    r.decl_duty_pct == null ? null : Number(r.decl_duty_pct),
    decl_form_e_pct:  r.decl_form_e_pct == null ? null : Number(r.decl_form_e_pct),
  };
}

export type HsLookupRow = {
  description:      string;
  default_duty_pct: number;
  form_e_duty_pct:  number;
  other_forms:      Record<string, number>;
  default_stat_code: string | null;
  // ── 0258 · trust signals ──
  /** false = default_duty_pct is an UNCONFIRMED placeholder. 0 then means
   *  "ไม่ทราบ", NOT "ยกเว้น" — surfaces so a persisted duty/VAT is never booked
   *  as exempt off a guess. */
  duty_confirmed:   boolean;
  /** อากรที่ใช้จริงบนใบขน (modal @ priv=000) — a cross-check, never the value used. */
  decl_duty_pct:    number | null;
  decl_count:       number;
};

// ────────────────────────────────────────────────────────────
// searchHsCodes — typeahead over the คลัง HS dictionary (#3).
// Staff TYPE the HS into the cost editor / triage / library — typos misroute
// duty + the ใบขน. This auto-search lets them PICK from the dictionary instead.
// Matches code OR description (Thai/EN) · returns the duty/form-e/stat fields
// the picker shows. Read-only reference lookup (§0e · no write).
// ────────────────────────────────────────────────────────────
export type HsSearchRow = {
  code:             string;
  description:      string;
  description_en:   string | null;
  default_duty_pct: number;
  form_e_duty_pct:  number;
  default_stat_code: string | null;
  // 0258 — so the picker can warn on an unconfirmed duty + rank real-world codes.
  duty_confirmed:   boolean;
  decl_count:       number;
  /** Set when the row matched via a doc-bot PRODUCT alias (e.g. "กระติกน้ำ"). */
  matched_product:  string | null;
};

const searchSchema = z.object({
  q:     z.string().trim().max(100),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const SEARCH_SELECT =
  "code, description, description_en, default_duty_pct, form_e_duty_pct, " +
  "default_stat_code, duty_confirmed, decl_count, hs8_key";

/**
 * Typeahead search over the unified คลัง HS CODE LIBRARY for the HS picker.
 *
 * Matches, in one pass:
 *   1. code / description (TH) / description_en — ILIKE, wildcards escaped
 *   2. hs8_key DIGITS — so "4202.29" finds the row stored as "42022900".
 *      The library mixes display styles by design (curated + ใบขน are dotted,
 *      doc_bot is raw 8-digit) and `code.ilike` alone would MISS across styles.
 *      Normalising the term to digits is the fix; rewriting display codes is not
 *      (a <8-digit heading must not be dressed up as a subheading).
 *   3. doc-bot PRODUCT aliases (doc_bot_hs_codes.th/en) via hs8_key — so typing
 *      a product name ("กระติกน้ำ") resolves to its code. This is doc-bot's real
 *      value: it is product-grain, the library is code-grain.
 *
 * Ranks real-world evidence first (decl_count desc = used on the most ใบขน).
 * Active codes only, capped (default 12). `q` < 2 chars returns [].
 * SAME read-roles as lookupHsCode so the CS lane (sales/ops) can pick too.
 * Reference read only — never writes (AGENTS.md §0e). §0c: error destructured.
 */
export async function searchHsCodes(
  q: string,
  limit?: number,
): Promise<AdminActionResult<HsSearchRow[]>> {
  const parsed = searchSchema.safeParse({ q, limit });
  if (!parsed.success) return { ok: true, data: [] };
  const term = parsed.data.q.trim();
  const cap = parsed.data.limit ?? 12;
  // < 2 chars is too broad for a typeahead → empty (the UI shows a "type more" hint).
  if (term.length < 2) return { ok: true, data: [] };

  return withAdmin([...HS_LOOKUP_ROLES], async () => {
    const admin = createAdminClient();
    // Escape PostgREST ILIKE wildcards/commas/parens so the term stays literal.
    const safe = term.replace(/[%_,()]/g, (m) => `\\${m}`);
    const digits = term.replace(/[^0-9]/g, "");

    const ors = [
      `code.ilike.%${safe}%`,
      `description.ilike.%${safe}%`,
      `description_en.ilike.%${safe}%`,
    ];
    // Cross-style digit match (see #2 above). Only when the term is digit-ish —
    // a 1-digit fragment would match nearly everything.
    if (digits.length >= 2) ors.push(`hs8_key.ilike.${digits}%`);

    const { data, error } = await admin
      .from("hs_codes")
      .select(SEARCH_SELECT)
      .eq("is_active", true)
      .or(ors.join(","))
      .order("decl_count", { ascending: false })
      .order("code", { ascending: true })
      .limit(cap);
    if (error) {
      console.error("[hs_codes search]", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }

    type Raw = HsSearchRow & { hs8_key: string | null };
    const byKey = new Map<string, Raw>();
    const out: Raw[] = ((data ?? []) as unknown as Raw[]).map((r) => ({
      ...r,
      default_duty_pct: Number(r.default_duty_pct),
      form_e_duty_pct:  Number(r.form_e_duty_pct),
      decl_count:       Number(r.decl_count ?? 0),
      matched_product:  null,
    }));
    for (const r of out) if (r.hs8_key) byKey.set(r.hs8_key, r);

    // ── #3 product-alias pass (only if there is room left) ──
    if (out.length < cap && /\p{L}/u.test(term)) {
      const { data: alias, error: aliasErr } = await admin
        .from("doc_bot_hs_codes")
        .select("hs8_key, th, en")
        .not("hs8_key", "is", null)
        .or(`th.ilike.%${safe}%,en.ilike.%${safe}%`)
        .limit(60);
      if (aliasErr) {
        // Non-fatal: the alias pass is an enrichment, not the contract. The
        // primary matches above still stand.
        console.error("[hs_codes search · alias]", { code: aliasErr.code, message: aliasErr.message });
      } else {
        const keys: string[] = [];
        const label = new Map<string, string>();
        for (const a of (alias ?? []) as { hs8_key: string; th: string | null; en: string | null }[]) {
          if (byKey.has(a.hs8_key) || label.has(a.hs8_key)) continue;
          label.set(a.hs8_key, (a.th || a.en || "").trim());
          keys.push(a.hs8_key);
        }
        if (keys.length) {
          const { data: extra, error: extraErr } = await admin
            .from("hs_codes")
            .select(SEARCH_SELECT)
            .eq("is_active", true)
            .in("hs8_key", keys.slice(0, cap * 3))
            .order("decl_count", { ascending: false })
            .limit(cap - out.length);
          if (extraErr) {
            console.error("[hs_codes search · alias resolve]", { code: extraErr.code, message: extraErr.message });
          } else {
            for (const r of (extra ?? []) as unknown as Raw[]) {
              if (byKey.has(r.hs8_key ?? "")) continue;
              out.push({
                ...r,
                default_duty_pct: Number(r.default_duty_pct),
                form_e_duty_pct:  Number(r.form_e_duty_pct),
                decl_count:       Number(r.decl_count ?? 0),
                matched_product:  label.get(r.hs8_key ?? "") || null,
              });
            }
          }
        }
      }
    }

    // hs8_key is an internal join/dedup key — it never leaves the action.
    return {
      ok: true,
      data: out.slice(0, cap).map((r): HsSearchRow => ({
        code:              r.code,
        description:       r.description,
        description_en:    r.description_en,
        default_duty_pct:  r.default_duty_pct,
        form_e_duty_pct:   r.form_e_duty_pct,
        default_stat_code: r.default_stat_code,
        duty_confirmed:    r.duty_confirmed === true,
        decl_count:        r.decl_count,
        matched_product:   r.matched_product,
      })),
    };
  });
}

const lookupSchema = z.object({ code: z.string().trim().min(1).max(20) });

/**
 * Look up ONE hs_code's duty fields for the cost-editor reference hint.
 * Returns the row's {description, default_duty_pct, form_e_duty_pct, other_forms}
 * or null when the code isn't in the dictionary. Reference read only — does NOT
 * change any cost/duty field (AGENTS.md §0e). §0c: error destructured.
 */
export async function lookupHsCode(
  code: string,
): Promise<AdminActionResult<HsLookupRow | null>> {
  const parsed = lookupSchema.safeParse({ code });
  if (!parsed.success) return { ok: true, data: null };

  return withAdmin([...HS_LOOKUP_ROLES], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("hs_codes")
      .select(
        "description, default_duty_pct, form_e_duty_pct, other_forms, default_stat_code, " +
          "duty_confirmed, decl_duty_pct, decl_count",
      )
      .eq("code", parsed.data.code)
      .maybeSingle<{
        description: string;
        default_duty_pct: number;
        form_e_duty_pct: number;
        other_forms: Record<string, number> | null;
        default_stat_code: string | null;
        duty_confirmed: boolean;
        decl_duty_pct: number | string | null;
        decl_count: number | string | null;
      }>();
    if (error) {
      console.error("[hs_codes lookup]", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    if (!data) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        description:      data.description,
        default_duty_pct: Number(data.default_duty_pct),
        form_e_duty_pct:  Number(data.form_e_duty_pct),
        other_forms:      (data.other_forms ?? {}) as Record<string, number>,
        default_stat_code: data.default_stat_code,
        duty_confirmed:   data.duty_confirmed === true,
        decl_duty_pct:    data.decl_duty_pct == null ? null : Number(data.decl_duty_pct),
        decl_count:       Number(data.decl_count ?? 0),
      },
    };
  });
}
