"use server";

// ════════════════════════════════════════════════════════════════════
// W9 — CARGO tax-doc 4-role WORKSPACE + state machine (P4 of the
// tax-invoice platform · docs/research/tax-invoice-platform-build-plan-
// 2026-06-09.md). A read + advance layer OVER the existing
// `tb_cargo_taxdoc_job` spine (mig 0161). It carries the THREE numbers
// through the FOUR roles — never conflating them:
//
//   CS       (SELLING)   · cs_status      — header selling total (+VAT → ใบกำกับ)
//   PRICING  (COST)      · pricing_status — Σ per-line cost (PEAK stock-in)
//   DOCS     (DECLARED)  · docs_status    — Σ per-line มูลค่าสำแดง (ใบขนรวม)
//   ACCOUNT  (PEAK)      · account_status — close-out (GATED on cs + pricing done)
//
// ⚠️ MONEY/TAX SAFETY (owner guardrail "ห้ามทำงานบัค งานหาย"):
//   - This file NEVER touches the money path: no wallet, no payment, no
//     selling/quote recompute, no commission, no order status, no customer
//     comms, no tax-invoice ISSUANCE. It only reads the 3 numbers (from
//     already-captured fields) + advances the 4 *_status workflow columns
//     on tb_cargo_taxdoc_job + links a declaration_id.
//   - SELLING ≠ COST ≠ DECLARED. The numbers are READ from their own
//     authoritative sources (header selling · per-line cost · per-line
//     declared) and surfaced side-by-side; this layer never auto-equals them.
//   - The ACCOUNT stage is the close-out gate (ADR-0014 state machine):
//     cannot mark Account done unless BOTH cs + pricing are done.
//
// RBAC: super + the 4 section roles (sales=CS · pricing=Pricing ·
//   freight_import_doc=Docs · accounting=Account). Per-stage advance uses
//   the section's role family (+ super always passes). Every mutation is
//   logAdminAction'd. Per AGENTS.md §0c every Supabase query destructures error.
// ════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/auth/require-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  TAXDOC_STAGES, TAXDOC_STAGE_COL as STAGE_COL,
  type TaxdocStage, type TaxdocStageStatus,
} from "@/lib/validators/cargo-taxdoc";

// Re-export the shared types so existing importers of this action file keep
// working (they were briefly exported here before being moved to the
// non-"use server" validator module). Type-only re-exports are erased at
// compile time → safe in a "use server" file.
export type { TaxdocStage, TaxdocStageStatus } from "@/lib/validators/cargo-taxdoc";

// Per-stage role families (super always passes via is_admin / requireAdmin).
const ROLES_CS: AdminRole[]      = ["super", "sales", "sales_admin", "ops"];
const ROLES_PRICING: AdminRole[] = ["super", "pricing", "accounting", "ops"];
const ROLES_DOCS: AdminRole[]    = ["super", "freight_import_doc", "freight_clearance_both", "ops"];
const ROLES_ACCOUNT: AdminRole[] = ["super", "accounting"];
const STAGE_ROLES: Record<TaxdocStage, AdminRole[]> = {
  cs:      ROLES_CS,
  pricing: ROLES_PRICING,
  docs:    ROLES_DOCS,
  account: ROLES_ACCOUNT,
};

// Anyone in the workspace can READ + materialise a job row.
const ROLES_WORKSPACE: AdminRole[] = [
  "super", "sales", "sales_admin", "pricing", "freight_import_doc",
  "freight_clearance_both", "accounting", "ops",
];

// ── Money helpers (read-only · display) ──────────────────────
function n(v: number | string | null | undefined): number {
  return v == null ? 0 : Number(v) || 0;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ════════════════════════════════════════════════════════════════════
// Internal — read the 3 numbers for an import-forwarder job (fid).
//   SELLING  = tb_forwarder.ftotalprice (the selling header total)
//   COST     = tb_forwarder.fcosttotalprice (cost-sheet authoritative) ·
//              fallback Σ tb_forwarder_item.cost_unit_thb × qty
//   DECLARED = Σ tb_forwarder_item.declared_value_thb (Docs's มูลค่าสำแดง)
// ════════════════════════════════════════════════════════════════════
type ThreeNumbers = { selling: number; cost: number; declared: number; lineCount: number };

async function readForwarderNumbers(
  admin: ReturnType<typeof createAdminClient>,
  fid: number,
): Promise<{ numbers: ThreeNumbers; userid: string | null; cabinet: string | null } | null> {
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fcabinetnumber, ftotalprice, fcosttotalprice")
    .eq("id", fid)
    .maybeSingle<{
      id: number; userid: string | null; fcabinetnumber: string | null;
      ftotalprice: number | string | null; fcosttotalprice: number | string | null;
    }>();
  if (fwdErr) {
    console.error("[taxdoc-workspace readForwarderNumbers fwd]", { fid, code: fwdErr.code, message: fwdErr.message });
    return null;
  }
  if (!fwd) return null;

  const { data: items, error: itemsErr } = await admin
    .from("tb_forwarder_item")
    .select("productqty, cost_unit_thb, declared_value_thb")
    .eq("fid", fid)
    .limit(1000);
  if (itemsErr) {
    console.error("[taxdoc-workspace readForwarderNumbers items]", { fid, code: itemsErr.code, message: itemsErr.message });
  }
  const list = (items ?? []) as Array<{ productqty: number | string | null; cost_unit_thb: number | string | null; declared_value_thb: number | string | null }>;

  const lineCostSum = list.reduce((s, it) => {
    const qty = Math.max(0, n(it.productqty));
    return s + n(it.cost_unit_thb) * (qty > 0 ? qty : 1);
  }, 0);
  const declaredSum = list.reduce((s, it) => s + n(it.declared_value_thb), 0);

  // Header cost (cost-sheet) is authoritative when present; else fall back to the
  // per-line cost sum (Pricing's capture).
  const headerCost = n(fwd.fcosttotalprice);
  const cost = headerCost > 0 ? headerCost : lineCostSum;

  return {
    numbers: {
      selling:   round2(n(fwd.ftotalprice)),
      cost:      round2(cost),
      declared:  round2(declaredSum),
      lineCount: list.length,
    },
    userid: fwd.userid,
    cabinet: fwd.fcabinetnumber?.trim() || null,
  };
}

// ════════════════════════════════════════════════════════════════════
// Internal — read the 3 numbers for a shop-order job (hno).
//   SELLING  = tb_header_order.htotalpriceuser (the customer total)
//   COST     = Σ tb_order.cost_unit_cny × qty × cost_rate_cny  (THB)
//              fallback tb_header_order.htotalpricechn (goods CNY-derived)
//   DECLARED = Σ tb_order.declared_value_thb
// ════════════════════════════════════════════════════════════════════
async function readShopNumbers(
  admin: ReturnType<typeof createAdminClient>,
  hno: string,
): Promise<{ numbers: ThreeNumbers; userid: string | null } | null> {
  const { data: hdr, error: hdrErr } = await admin
    .from("tb_header_order")
    .select("hno, userid, htotalpriceuser, htotalpricechn")
    .eq("hno", hno)
    .maybeSingle<{
      hno: string; userid: string | null;
      htotalpriceuser: number | string | null; htotalpricechn: number | string | null;
    }>();
  if (hdrErr) {
    console.error("[taxdoc-workspace readShopNumbers hdr]", { hno, code: hdrErr.code, message: hdrErr.message });
    return null;
  }
  if (!hdr) return null;

  const { data: items, error: itemsErr } = await admin
    .from("tb_order")
    .select("orderqty, cost_unit_cny, cost_rate_cny, declared_value_thb")
    .eq("hno", hno)
    .limit(1000);
  if (itemsErr) {
    console.error("[taxdoc-workspace readShopNumbers items]", { hno, code: itemsErr.code, message: itemsErr.message });
  }
  const list = (items ?? []) as Array<{ orderqty: number | string | null; cost_unit_cny: number | string | null; cost_rate_cny: number | string | null; declared_value_thb: number | string | null }>;

  const lineCostThb = list.reduce((s, it) => {
    const qty = Math.max(0, n(it.orderqty));
    const rate = n(it.cost_rate_cny);
    return s + n(it.cost_unit_cny) * (qty > 0 ? qty : 1) * (rate > 0 ? rate : 1);
  }, 0);
  const declaredSum = list.reduce((s, it) => s + n(it.declared_value_thb), 0);

  // Cost-side fallback: htotalpricechn is the goods cost in THB-equivalent.
  const cost = lineCostThb > 0 ? lineCostThb : n(hdr.htotalpricechn);

  return {
    numbers: {
      selling:   round2(n(hdr.htotalpriceuser)),
      cost:      round2(cost),
      declared:  round2(declaredSum),
      lineCount: list.length,
    },
    userid: hdr.userid,
  };
}

// ════════════════════════════════════════════════════════════════════
// Internal — ensure a tb_cargo_taxdoc_job row exists (idempotent).
//   keyed by EXACTLY one of fid / hno. Materialises doc_mode + cabinet
//   from the source order. Does NOT log (callers log their own action).
// ════════════════════════════════════════════════════════════════════
export type TaxdocJobRow = {
  id: string;
  fid: number | null;
  hno: string | null;
  doc_mode: string;
  cs_status: TaxdocStageStatus;
  pricing_status: TaxdocStageStatus;
  docs_status: TaxdocStageStatus;
  account_status: TaxdocStageStatus;
  cabinet_no: string | null;
  declaration_id: string | null;
  notes: string | null;
};

async function ensureJobRow(
  admin: ReturnType<typeof createAdminClient>,
  key: { fid: number } | { hno: string },
  adminId: string,
): Promise<{ ok: true; row: TaxdocJobRow } | { ok: false; error: string }> {
  const filterCol = "fid" in key ? "fid" : "hno";
  const filterVal = "fid" in key ? key.fid : key.hno;

  const { data: existing, error: exErr } = await admin
    .from("tb_cargo_taxdoc_job")
    .select("*")
    .eq(filterCol, filterVal)
    .maybeSingle<TaxdocJobRow>();
  if (exErr) {
    console.error("[taxdoc-workspace ensureJobRow lookup]", { key, code: exErr.code, message: exErr.message });
    return { ok: false, error: `db_error:${exErr.code ?? "unknown"}` };
  }
  if (existing) return { ok: true, row: existing };

  // Materialise doc_mode + cabinet from the source order.
  let docMode = "none";
  let cabinet: string | null = null;
  if ("fid" in key) {
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fcabinetnumber, tax_doc_pref")
      .eq("id", key.fid)
      .maybeSingle<{ id: number; fcabinetnumber: string | null; tax_doc_pref: string | null }>();
    if (fwdErr) {
      console.error("[taxdoc-workspace ensureJobRow fwd]", { fid: key.fid, code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    if (!fwd) return { ok: false, error: "forwarder_not_found" };
    docMode = (fwd.tax_doc_pref ?? "none").trim() || "none";
    cabinet = fwd.fcabinetnumber?.trim() || null;
  } else {
    const { data: hdr, error: hdrErr } = await admin
      .from("tb_header_order")
      .select("hno, tax_doc_pref")
      .eq("hno", key.hno)
      .maybeSingle<{ hno: string; tax_doc_pref: string | null }>();
    if (hdrErr) {
      console.error("[taxdoc-workspace ensureJobRow hdr]", { hno: key.hno, code: hdrErr.code, message: hdrErr.message });
      return { ok: false, error: `db_error:${hdrErr.code ?? "unknown"}` };
    }
    if (!hdr) return { ok: false, error: "shop_order_not_found" };
    docMode = (hdr.tax_doc_pref ?? "none").trim() || "none";
  }

  // Normalise doc_mode to the table's CHECK set.
  if (!["none", "receipt", "tax_invoice", "customs"].includes(docMode)) docMode = "none";

  const insertRow: Record<string, unknown> = {
    doc_mode: docMode,
    cabinet_no: cabinet,
    created_by_admin_id: adminId,
    updated_by_admin_id: adminId,
  };
  if ("fid" in key) insertRow.fid = key.fid;
  else insertRow.hno = key.hno;

  const { data: inserted, error: insErr } = await admin
    .from("tb_cargo_taxdoc_job")
    .insert(insertRow)
    .select("*")
    .single<TaxdocJobRow>();
  if (insErr || !inserted) {
    // Concurrent-insert race — re-read (partial unique index protects us).
    const { data: reread, error: rErr } = await admin
      .from("tb_cargo_taxdoc_job")
      .select("*")
      .eq(filterCol, filterVal)
      .maybeSingle<TaxdocJobRow>();
    if (rErr || !reread) {
      console.error("[taxdoc-workspace ensureJobRow insert]", { key, code: insErr?.code, message: insErr?.message });
      return { ok: false, error: `insert_failed:${insErr?.message ?? "no_row"}` };
    }
    return { ok: true, row: reread };
  }
  return { ok: true, row: inserted };
}

// ════════════════════════════════════════════════════════════════════
// 1) Materialise a job (used by the detail page / list "เปิดงาน" button).
// ════════════════════════════════════════════════════════════════════
const ensureJobSchema = z
  .object({ fid: z.coerce.number().int().positive().optional(), hno: z.string().trim().min(1).optional() })
  .refine((v) => (v.fid != null) !== (v.hno != null), { message: "exactly_one_of_fid_hno" });

export async function adminEnsureCargoTaxdocJob(
  input: { fid?: number | string; hno?: string },
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = ensureJobSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_WORKSPACE], async ({ adminId }) => {
    const admin = createAdminClient();
    const key = d.fid != null ? { fid: d.fid } : { hno: d.hno! };
    const res = await ensureJobRow(admin, key, adminId);
    if (!res.ok) return res;
    revalidatePath("/admin/pricing/taxdoc-workspace");
    revalidatePath(`/admin/pricing/taxdoc-workspace/${res.row.id}`);
    return { ok: true, data: { id: res.row.id } };
  });
}

// ════════════════════════════════════════════════════════════════════
// 2) Advance a stage status (the state machine). Account gated on cs+pricing.
// ════════════════════════════════════════════════════════════════════
const advanceStageSchema = z.object({
  jobId: z.string().uuid(),
  stage: z.enum(TAXDOC_STAGES),
  status: z.enum(["", "in_progress", "done"]),
});

export async function adminAdvanceCargoTaxdocStage(
  input: { jobId: string; stage: TaxdocStage; status: TaxdocStageStatus },
): Promise<AdminActionResult<void>> {
  const parsed = advanceStageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  const roles = STAGE_ROLES[d.stage] ?? ROLES_WORKSPACE;

  return withAdmin(roles, async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: job, error: jobErr } = await admin
      .from("tb_cargo_taxdoc_job")
      .select("id, fid, hno, cs_status, pricing_status, docs_status, account_status")
      .eq("id", d.jobId)
      .maybeSingle<{ id: string; fid: number | null; hno: string | null; cs_status: TaxdocStageStatus; pricing_status: TaxdocStageStatus; docs_status: TaxdocStageStatus; account_status: TaxdocStageStatus }>();
    if (jobErr) {
      console.error("[taxdoc-workspace advanceStage lookup]", { jobId: d.jobId, code: jobErr.code, message: jobErr.message });
      return { ok: false, error: `db_error:${jobErr.code ?? "unknown"}` };
    }
    if (!job) return { ok: false, error: "job_not_found" };

    // ACCOUNT gate (ADR-0014 state machine): cannot close ACCOUNT unless
    // both CS (selling) and PRICING (cost) are done.
    if (d.stage === "account" && d.status === "done") {
      if (job.cs_status !== "done" || job.pricing_status !== "done") {
        return { ok: false, error: "account_gated: ต้องปิด CS (ขาย) และ PRICING (ต้นทุน) ก่อน" };
      }
    }

    const col = STAGE_COL[d.stage];
    const { error: updErr } = await admin
      .from("tb_cargo_taxdoc_job")
      .update({ [col]: d.status, updated_by_admin_id: adminId })
      .eq("id", d.jobId);
    if (updErr) {
      console.error("[taxdoc-workspace advanceStage update]", { jobId: d.jobId, code: updErr.code, message: updErr.message });
      return { ok: false, error: `update_failed:${updErr.message}` };
    }

    await logAdminAction(adminId, `cargo_taxdoc.${d.stage}_status`, "tb_cargo_taxdoc_job", d.jobId, {
      fid: job.fid, hno: job.hno, stage: d.stage, status: d.status,
    });

    revalidatePath("/admin/pricing/taxdoc-workspace");
    revalidatePath(`/admin/pricing/taxdoc-workspace/${d.jobId}`);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// 3) Set doc-mode on the job (CS chooses เอกสาร mode — display/route only,
//    NEVER triggers issuance). Mirrors the tax_doc_pref vocabulary.
// ════════════════════════════════════════════════════════════════════
const setDocModeSchema = z.object({
  jobId: z.string().uuid(),
  docMode: z.enum(["none", "receipt", "tax_invoice", "customs"]),
});

export async function adminSetCargoTaxdocMode(
  input: { jobId: string; docMode: string },
): Promise<AdminActionResult<void>> {
  const parsed = setDocModeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_CS, ...ROLES_ACCOUNT], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error: updErr } = await admin
      .from("tb_cargo_taxdoc_job")
      .update({ doc_mode: d.docMode, updated_by_admin_id: adminId })
      .eq("id", d.jobId);
    if (updErr) {
      console.error("[taxdoc-workspace setDocMode update]", { jobId: d.jobId, code: updErr.code, message: updErr.message });
      return { ok: false, error: `update_failed:${updErr.message}` };
    }
    await logAdminAction(adminId, "cargo_taxdoc.set_doc_mode", "tb_cargo_taxdoc_job", d.jobId, { doc_mode: d.docMode });
    revalidatePath("/admin/pricing/taxdoc-workspace");
    revalidatePath(`/admin/pricing/taxdoc-workspace/${d.jobId}`);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// 4) READ — list jobs (the workspace table). Existing tb_cargo_taxdoc_job
//    rows + arrived import-forwarders that have a doc-mode preference set
//    but no job yet (the "needs a workspace" candidates).
// ════════════════════════════════════════════════════════════════════
export type TaxdocJobListItem = {
  jobId: string | null;          // null = candidate (no job row yet)
  fid: number | null;
  hno: string | null;
  source: "forwarder" | "shop";
  userid: string | null;
  cabinetNo: string | null;
  docMode: string;
  csStatus: TaxdocStageStatus;
  pricingStatus: TaxdocStageStatus;
  docsStatus: TaxdocStageStatus;
  accountStatus: TaxdocStageStatus;
  declarationId: string | null;
  selling: number;
  cost: number;
  declared: number;
};

export type TaxdocJobListResult = {
  jobs: TaxdocJobListItem[];
  candidates: TaxdocJobListItem[];
  stats: { jobs: number; candidates: number; csDone: number; pricingDone: number; docsDone: number; accountDone: number };
};

export async function adminListCargoTaxdocJobs(): Promise<AdminActionResult<TaxdocJobListResult>> {
  return withAdmin([...ROLES_WORKSPACE], async () => {
    const admin = createAdminClient();

    // 1) Existing job rows.
    const { data: jobRaw, error: jobErr } = await admin
      .from("tb_cargo_taxdoc_job")
      .select("id, fid, hno, doc_mode, cs_status, pricing_status, docs_status, account_status, cabinet_no, declaration_id")
      .order("updated_at", { ascending: false })
      .limit(300);
    if (jobErr) {
      console.error("[taxdoc-workspace list jobs]", { code: jobErr.code, message: jobErr.message });
      return { ok: false, error: `db_error:${jobErr.code ?? "unknown"}` };
    }
    const jobRows = (jobRaw ?? []) as TaxdocJobRow[];

    const jobs: TaxdocJobListItem[] = [];
    for (const j of jobRows) {
      let numbers: ThreeNumbers = { selling: 0, cost: 0, declared: 0, lineCount: 0 };
      let userid: string | null = null;
      if (j.fid != null) {
        const r = await readForwarderNumbers(admin, j.fid);
        if (r) { numbers = r.numbers; userid = r.userid; }
      } else if (j.hno != null) {
        const r = await readShopNumbers(admin, j.hno);
        if (r) { numbers = r.numbers; userid = r.userid; }
      }
      jobs.push({
        jobId: j.id,
        fid: j.fid,
        hno: j.hno,
        source: j.fid != null ? "forwarder" : "shop",
        userid,
        cabinetNo: j.cabinet_no,
        docMode: j.doc_mode,
        csStatus: j.cs_status,
        pricingStatus: j.pricing_status,
        docsStatus: j.docs_status,
        accountStatus: j.account_status,
        declarationId: j.declaration_id,
        selling: numbers.selling,
        cost: numbers.cost,
        declared: numbers.declared,
      });
    }

    // 2) Candidate import-forwarders — arrived in TH (fstatus ≥ 4) with a
    //    doc-mode preference (tax_invoice / customs) but no job row yet.
    const fidsWithJob = new Set(jobRows.filter((j) => j.fid != null).map((j) => j.fid!));
    const { data: candRaw, error: candErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fcabinetnumber, tax_doc_pref, ftotalprice, fcosttotalprice")
      .in("fstatus", ["4", "5", "6"])
      .in("tax_doc_pref", ["tax_invoice", "customs"])
      .order("id", { ascending: false })
      .limit(150);
    if (candErr) {
      console.error("[taxdoc-workspace list candidates]", { code: candErr.code, message: candErr.message });
    }
    const candidates: TaxdocJobListItem[] = [];
    for (const c of ((candRaw ?? []) as Array<{ id: number; userid: string | null; fcabinetnumber: string | null; tax_doc_pref: string | null; ftotalprice: number | string | null; fcosttotalprice: number | string | null }>)) {
      if (fidsWithJob.has(c.id)) continue;
      candidates.push({
        jobId: null,
        fid: c.id,
        hno: null,
        source: "forwarder",
        userid: c.userid,
        cabinetNo: c.fcabinetnumber?.trim() || null,
        docMode: (c.tax_doc_pref ?? "none").trim() || "none",
        csStatus: "",
        pricingStatus: "",
        docsStatus: "",
        accountStatus: "",
        declarationId: null,
        selling: round2(n(c.ftotalprice)),
        cost: round2(n(c.fcosttotalprice)),
        declared: 0,
      });
    }

    const stats = {
      jobs: jobs.length,
      candidates: candidates.length,
      csDone:      jobs.filter((j) => j.csStatus === "done").length,
      pricingDone: jobs.filter((j) => j.pricingStatus === "done").length,
      docsDone:    jobs.filter((j) => j.docsStatus === "done").length,
      accountDone: jobs.filter((j) => j.accountStatus === "done").length,
    };

    return { ok: true, data: { jobs, candidates, stats } };
  });
}

// ════════════════════════════════════════════════════════════════════
// 5) READ — single job detail (3 numbers + 4 status + linked declaration).
// ════════════════════════════════════════════════════════════════════
export type TaxdocJobDetail = {
  jobId: string;
  fid: number | null;
  hno: string | null;
  source: "forwarder" | "shop";
  userid: string | null;
  cabinetNo: string | null;
  docMode: string;
  csStatus: TaxdocStageStatus;
  pricingStatus: TaxdocStageStatus;
  docsStatus: TaxdocStageStatus;
  accountStatus: TaxdocStageStatus;
  declarationId: string | null;
  declarationNo: string | null;
  notes: string | null;
  selling: number;
  cost: number;
  declared: number;
  lineCount: number;
  /** display-only profit = selling − cost (NOT the money path). */
  grossProfit: number;
};

export async function adminGetCargoTaxdocJob(args: {
  jobId: string;
}): Promise<AdminActionResult<TaxdocJobDetail>> {
  return withAdmin([...ROLES_WORKSPACE], async () => {
    const admin = createAdminClient();

    const { data: job, error: jobErr } = await admin
      .from("tb_cargo_taxdoc_job")
      .select("id, fid, hno, doc_mode, cs_status, pricing_status, docs_status, account_status, cabinet_no, declaration_id, notes")
      .eq("id", args.jobId)
      .maybeSingle<TaxdocJobRow>();
    if (jobErr) {
      console.error("[taxdoc-workspace get job]", { jobId: args.jobId, code: jobErr.code, message: jobErr.message });
      return { ok: false, error: `db_error:${jobErr.code ?? "unknown"}` };
    }
    if (!job) return { ok: false, error: "job_not_found" };

    let numbers: ThreeNumbers = { selling: 0, cost: 0, declared: 0, lineCount: 0 };
    let userid: string | null = null;
    let cabinet: string | null = job.cabinet_no;
    if (job.fid != null) {
      const r = await readForwarderNumbers(admin, job.fid);
      if (r) { numbers = r.numbers; userid = r.userid; cabinet = cabinet ?? r.cabinet; }
    } else if (job.hno != null) {
      const r = await readShopNumbers(admin, job.hno);
      if (r) { numbers = r.numbers; userid = r.userid; }
    }

    // Linked declaration number (if Docs has created the ใบขนรวม).
    let declarationNo: string | null = null;
    if (job.declaration_id) {
      const { data: decl, error: declErr } = await admin
        .from("customs_declarations")
        .select("id, declaration_no")
        .eq("id", job.declaration_id)
        .maybeSingle<{ id: string; declaration_no: string | null }>();
      if (declErr) {
        console.error("[taxdoc-workspace get decl]", { declarationId: job.declaration_id, code: declErr.code, message: declErr.message });
      } else if (decl) {
        declarationNo = decl.declaration_no;
      }
    }

    return {
      ok: true,
      data: {
        jobId: job.id,
        fid: job.fid,
        hno: job.hno,
        source: job.fid != null ? "forwarder" : "shop",
        userid,
        cabinetNo: cabinet,
        docMode: job.doc_mode,
        csStatus: job.cs_status,
        pricingStatus: job.pricing_status,
        docsStatus: job.docs_status,
        accountStatus: job.account_status,
        declarationId: job.declaration_id,
        declarationNo,
        notes: job.notes,
        selling: numbers.selling,
        cost: numbers.cost,
        declared: numbers.declared,
        lineCount: numbers.lineCount,
        grossProfit: round2(numbers.selling - numbers.cost),
      },
    };
  });
}
