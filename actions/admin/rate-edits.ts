"use server";

/**
 * /admin/rates/* server actions — Wave 12-D (2026-05-23 · ภูม brief)
 *
 * Two surfaces gain edit capability:
 *
 * 1. VIP-tier matrix  → adminUpdateVipRateCells (UPSERT pair)
 *    Legacy ref: pcs-admin/rate-vip.php L1-32 (UPDATE tb_rate_vip_kg /
 *    tb_rate_vip_cbm by row id). The legacy edits ONE field at a time
 *    (KG or CBM) via two modal forms. We send the WHOLE matrix in one
 *    submit (better UX) and split the diff internally — same DB end-state.
 *
 *    Composite identity of a cell: (coid, sourcewarehouse, rtransporttype,
 *    rproductstype). Schema has no UNIQUE constraint on that tuple (PK is
 *    just `id`), so we must read-then-update-or-insert. The legacy never
 *    INSERTed from this surface (cells were pre-seeded), but we keep the
 *    safety: if a row goes missing somehow, INSERT to restore.
 *
 * 2. Per-customer HS-style rates → adminUpdateCustomerHsRates (history-snap)
 *    Legacy ref: pcs-admin/users.php L527-591 (insertRateKG / insertRateCBM
 *    helpers + the wrapping IF that creates one tb_customrate_hs row + N
 *    child rows). Pattern is APPEND-ONLY:
 *      1. INSERT one tb_customrate_hs row (history header)
 *      2. For each cell where new ≠ before, INSERT a tb_hs_rate_custom_kg
 *         row with rkgbefore=old · rkg=new · crhsid=new_history_id (and
 *         CBM equivalent for that cell).
 *    Legacy ONLY inserts the cells that actually changed (skips no-op
 *    rows — saves storage + makes the audit log meaningful). We mirror.
 *
 *    "Before" lookup: a cell's current value = the latest tb_hs_rate_custom_*
 *    row for that (userid, wh, rtt, prod) joined by max(crhsid). If no
 *    row exists yet, the customer is using their VIP-tier rate (or the
 *    default), so the legacy treats the cell as "no override" — rkgbefore
 *    is set to whatever value the form posted as "current" (which the page
 *    pre-fills from the same join we'll do here).
 *
 * Audit: both actions write an admin_audit_log row + the legacy
 * adminidupdate column stamp.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — duplicated from wallet-hs.ts /
// warehouse-history.ts / combine-bill.ts etc. (7 callers now — runbook
// "extract on the 3rd repeat" is past due; deferred to a separate
// refactor task to keep Wave 12-D small).
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
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ────────────────────────────────────────────────────────────
// 1. VIP-tier matrix edit
// ────────────────────────────────────────────────────────────

const vipCellSchema = z.object({
  sourcewarehouse: z.enum(["1", "2"]),
  rtransporttype: z.enum(["1", "2", "3"]),
  rproductstype: z.enum(["1", "2", "3", "4"]),
  rkg: z.number().nullable(),
  rcbm: z.number().nullable(),
});
const vipUpdateSchema = z.object({
  coid: z.string().trim().min(1).max(10),
  cells: z.array(vipCellSchema).min(1).max(48), // 2 wh × 3 rtt × 4 prod = 24 cells max (sane upper bound 48)
});
export type AdminUpdateVipRateCellsInput = z.infer<typeof vipUpdateSchema>;

export async function adminUpdateVipRateCells(
  input: AdminUpdateVipRateCellsInput,
): Promise<AdminActionResult<{ kg_writes: number; cbm_writes: number }>> {
  const parsed = vipUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ kg_writes: number; cbm_writes: number }>(
    ["accounting", "super"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Read the existing KG + CBM rows for this coid so we can decide
      // UPDATE-by-id vs INSERT. Loading all rows for ONE coid (≤24 cells)
      // is cheap; no need to fetch per cell.
      const [{ data: kgRaw }, { data: cbmRaw }] = await Promise.all([
        admin
          .from("tb_rate_vip_kg")
          .select("id,sourcewarehouse,rtransporttype,rproductstype,rkg")
          .eq("coid", d.coid),
        admin
          .from("tb_rate_vip_cbm")
          .select("id,sourcewarehouse,rtransporttype,rproductstype,rcbm")
          .eq("coid", d.coid),
      ]);

      type ExistKg = { id: number; sourcewarehouse: string; rtransporttype: string; rproductstype: string; rkg: number | null };
      type ExistCbm = { id: number; sourcewarehouse: string; rtransporttype: string; rproductstype: string; rcbm: number | null };
      const key = (r: { sourcewarehouse: string; rtransporttype: string; rproductstype: string }) =>
        `${r.sourcewarehouse}|${r.rtransporttype}|${r.rproductstype}`;
      const kgIndex = new Map<string, ExistKg>(((kgRaw ?? []) as unknown as ExistKg[]).map((r) => [key(r), r]));
      const cbmIndex = new Map<string, ExistCbm>(((cbmRaw ?? []) as unknown as ExistCbm[]).map((r) => [key(r), r]));

      let kgWrites = 0;
      let cbmWrites = 0;
      const diffs: Array<{ key: string; kg?: { before: number | null; after: number | null }; cbm?: { before: number | null; after: number | null } }> = [];

      for (const cell of d.cells) {
        const k = key(cell);

        // KG side
        if (cell.rkg != null) {
          const existing = kgIndex.get(k);
          const before = existing?.rkg != null ? Number(existing.rkg) : null;
          const after = cell.rkg;
          if (before !== after) {
            if (existing) {
              const { error } = await admin
                .from("tb_rate_vip_kg")
                .update({ rkg: after, adminidupdate: legacyAdminId })
                .eq("id", existing.id);
              if (error) return { ok: false, error: `KG update failed [${k}]: ${error.message}` };
            } else {
              const { error } = await admin.from("tb_rate_vip_kg").insert({
                coid: d.coid,
                sourcewarehouse: cell.sourcewarehouse,
                rtransporttype: cell.rtransporttype,
                rproductstype: cell.rproductstype,
                rkg: after,
                adminidupdate: legacyAdminId,
              });
              if (error) return { ok: false, error: `KG insert failed [${k}]: ${error.message}` };
            }
            kgWrites++;
            diffs.push({ key: k, kg: { before, after } });
          }
        }

        // CBM side
        if (cell.rcbm != null) {
          const existing = cbmIndex.get(k);
          const before = existing?.rcbm != null ? Number(existing.rcbm) : null;
          const after = cell.rcbm;
          if (before !== after) {
            if (existing) {
              const { error } = await admin
                .from("tb_rate_vip_cbm")
                .update({ rcbm: after, adminidupdate: legacyAdminId })
                .eq("id", existing.id);
              if (error) return { ok: false, error: `CBM update failed [${k}]: ${error.message}` };
            } else {
              const { error } = await admin.from("tb_rate_vip_cbm").insert({
                coid: d.coid,
                sourcewarehouse: cell.sourcewarehouse,
                rtransporttype: cell.rtransporttype,
                rproductstype: cell.rproductstype,
                rcbm: after,
                adminidupdate: legacyAdminId,
              });
              if (error) return { ok: false, error: `CBM insert failed [${k}]: ${error.message}` };
            }
            cbmWrites++;
            const existing_d = diffs.find((x) => x.key === k);
            if (existing_d) existing_d.cbm = { before, after };
            else diffs.push({ key: k, cbm: { before, after } });
          }
        }
      }

      await logAdminAction(adminId, "tb_rate_vip.update", "tb_rate_vip", d.coid, {
        coid: d.coid,
        kg_writes: kgWrites,
        cbm_writes: cbmWrites,
        diffs,
      });

      revalidatePath("/admin/rates/custom-user");
      return { ok: true, data: { kg_writes: kgWrites, cbm_writes: cbmWrites } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// 1b. GENERAL-tier matrix edit (Theme B · 2026-05-31 · เดฟ)
//
// THE MONEY P0: the rebuilt `/admin/rates/general` editor (rates.ts
// adminUpsertGeneralRate) writes the REBUILT, prod-empty `rate_general` table,
// but the pricing engine (lib/forwarder/resolve-rate.ts · used by
// forwarders-edit.ts L222-238) READS `tb_rate_g_kg` / `tb_rate_g_cbm`. So an
// admin "changing the general rates" changed NOTHING the engine used. This
// action writes the tables the engine actually reads — the faithful twin of
// adminUpdateVipRateCells, but for the GENERAL bucket (tiered: 3 KG tiers +
// 3 CBM tiers per cell).
//
// Legacy ref: rate.php (the general rate screen · tb_rate_g_kg/cbm). The
// general bucket is keyed by coid='PCS' (the PCS<n>→PR<n> rebrand keeps the
// legacy 'PCS' coid token for the general/non-VIP customers — verified: prod
// tb_rate_g_kg has coid='PCS', 16 rows).
//
// Cell identity: (coid, sourcewarehouse '1'กวางโจว/'2'อี้อู, rgtransporttype
// '1'รถ/'2'เรือ/'3'อากาศ, rgproductstype '1'ทั่วไป/'2'มอก/'3'อย/'4'พิเศษ).
// Tiers: rgkg1/2/3 (KG weight breaks) + rgcbm1/2/3 (CBM breaks). resolve-rate.ts
// reads all three tiers (ResolveRateCandidates.generalKg = {tier1,tier2,tier3}).
// ────────────────────────────────────────────────────────────

const generalCellSchema = z.object({
  sourcewarehouse: z.enum(["1", "2"]),
  rgtransporttype: z.enum(["1", "2", "3"]),
  rgproductstype: z.enum(["1", "2", "3", "4"]),
  // KG tiers (null = leave that tier untouched / not set)
  kg1: z.number().nonnegative().max(100_000).nullable(),
  kg2: z.number().nonnegative().max(100_000).nullable(),
  kg3: z.number().nonnegative().max(100_000).nullable(),
  // CBM tiers
  cbm1: z.number().nonnegative().max(1_000_000).nullable(),
  cbm2: z.number().nonnegative().max(1_000_000).nullable(),
  cbm3: z.number().nonnegative().max(1_000_000).nullable(),
});
const generalUpdateSchema = z.object({
  coid:  z.string().trim().min(1).max(10),     // 'PCS' = the general bucket
  cells: z.array(generalCellSchema).min(1).max(48), // 2 wh × 3 tt × 4 prod = 24
});
export type AdminUpdateGeneralRateCellsInput = z.infer<typeof generalUpdateSchema>;

export async function adminUpdateGeneralRateCells(
  input: AdminUpdateGeneralRateCellsInput,
): Promise<AdminActionResult<{ kg_writes: number; cbm_writes: number }>> {
  const parsed = generalUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ kg_writes: number; cbm_writes: number }>(
    ["accounting", "super"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Load existing rows for this coid (≤24 cells — cheap).
      const [{ data: kgRaw }, { data: cbmRaw }] = await Promise.all([
        admin.from("tb_rate_g_kg")
          .select("id,sourcewarehouse,rgtransporttype,rgproductstype,rgkg1,rgkg2,rgkg3").eq("coid", d.coid),
        admin.from("tb_rate_g_cbm")
          .select("id,sourcewarehouse,rgtransporttype,rgproductstype,rgcbm1,rgcbm2,rgcbm3").eq("coid", d.coid),
      ]);
      type ExistKg = { id: number; sourcewarehouse: string; rgtransporttype: string; rgproductstype: string; rgkg1: number | null; rgkg2: number | null; rgkg3: number | null };
      type ExistCbm = { id: number; sourcewarehouse: string; rgtransporttype: string; rgproductstype: string; rgcbm1: number | null; rgcbm2: number | null; rgcbm3: number | null };
      const key = (r: { sourcewarehouse: string; rgtransporttype: string; rgproductstype: string }) =>
        `${r.sourcewarehouse}|${r.rgtransporttype}|${r.rgproductstype}`;
      const kgIndex = new Map<string, ExistKg>(((kgRaw ?? []) as unknown as ExistKg[]).map((r) => [key(r), r]));
      const cbmIndex = new Map<string, ExistCbm>(((cbmRaw ?? []) as unknown as ExistCbm[]).map((r) => [key(r), r]));

      let kgWrites = 0;
      let cbmWrites = 0;
      const diffs: Array<{ key: string; kind: "kg" | "cbm"; op: "update" | "insert" }> = [];
      const numOrNull = (v: number | null) => (v == null ? null : v);

      for (const c of d.cells) {
        const k = key(c);

        // KG tiers — write only if ANY tier provided AND differs from existing.
        if (c.kg1 != null || c.kg2 != null || c.kg3 != null) {
          const ex = kgIndex.get(k);
          const same =
            ex != null &&
            Number(ex.rgkg1 ?? NaN) === Number(c.kg1 ?? NaN) &&
            Number(ex.rgkg2 ?? NaN) === Number(c.kg2 ?? NaN) &&
            Number(ex.rgkg3 ?? NaN) === Number(c.kg3 ?? NaN);
          if (!same) {
            if (ex) {
              const { error } = await admin.from("tb_rate_g_kg")
                .update({ rgkg1: numOrNull(c.kg1), rgkg2: numOrNull(c.kg2), rgkg3: numOrNull(c.kg3), adminidupdate: legacyAdminId })
                .eq("id", ex.id);
              if (error) return { ok: false, error: `KG update failed [${k}]: ${error.message}` };
              diffs.push({ key: k, kind: "kg", op: "update" });
            } else {
              const { error } = await admin.from("tb_rate_g_kg").insert({
                coid: d.coid, sourcewarehouse: c.sourcewarehouse, rgtransporttype: c.rgtransporttype, rgproductstype: c.rgproductstype,
                rgkg1: numOrNull(c.kg1), rgkg2: numOrNull(c.kg2), rgkg3: numOrNull(c.kg3), adminidupdate: legacyAdminId,
              });
              if (error) return { ok: false, error: `KG insert failed [${k}]: ${error.message}` };
              diffs.push({ key: k, kind: "kg", op: "insert" });
            }
            kgWrites++;
          }
        }

        // CBM tiers
        if (c.cbm1 != null || c.cbm2 != null || c.cbm3 != null) {
          const ex = cbmIndex.get(k);
          const same =
            ex != null &&
            Number(ex.rgcbm1 ?? NaN) === Number(c.cbm1 ?? NaN) &&
            Number(ex.rgcbm2 ?? NaN) === Number(c.cbm2 ?? NaN) &&
            Number(ex.rgcbm3 ?? NaN) === Number(c.cbm3 ?? NaN);
          if (!same) {
            if (ex) {
              const { error } = await admin.from("tb_rate_g_cbm")
                .update({ rgcbm1: numOrNull(c.cbm1), rgcbm2: numOrNull(c.cbm2), rgcbm3: numOrNull(c.cbm3), adminidupdate: legacyAdminId })
                .eq("id", ex.id);
              if (error) return { ok: false, error: `CBM update failed [${k}]: ${error.message}` };
              diffs.push({ key: k, kind: "cbm", op: "update" });
            } else {
              const { error } = await admin.from("tb_rate_g_cbm").insert({
                coid: d.coid, sourcewarehouse: c.sourcewarehouse, rgtransporttype: c.rgtransporttype, rgproductstype: c.rgproductstype,
                rgcbm1: numOrNull(c.cbm1), rgcbm2: numOrNull(c.cbm2), rgcbm3: numOrNull(c.cbm3), adminidupdate: legacyAdminId,
              });
              if (error) return { ok: false, error: `CBM insert failed [${k}]: ${error.message}` };
              diffs.push({ key: k, kind: "cbm", op: "insert" });
            }
            cbmWrites++;
          }
        }
      }

      await logAdminAction(adminId, "tb_rate_g.update", "tb_rate_g", d.coid, {
        coid: d.coid, kg_writes: kgWrites, cbm_writes: cbmWrites, diffs,
      });

      revalidatePath("/admin/rates/general");
      revalidatePath("/admin/rates");
      return { ok: true, data: { kg_writes: kgWrites, cbm_writes: cbmWrites } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// 2. Per-customer HS-style rates edit
// ────────────────────────────────────────────────────────────

const hsCellSchema = z.object({
  sourcewarehouse: z.enum(["1", "2"]),
  rtransporttype: z.enum(["1", "2", "3"]),
  rproductstype: z.enum(["1", "2", "3", "4"]),
  rkg: z.number().nullable(),
  rcbm: z.number().nullable(),
});
const hsUpdateSchema = z.object({
  userid: z
    .string()
    .trim()
    .regex(/^PR\d+$/i, "userid ต้องเป็นรหัส PR####")
    .max(30),
  cells: z.array(hsCellSchema).min(1).max(48),
});
export type AdminUpdateCustomerHsRatesInput = z.infer<typeof hsUpdateSchema>;

export async function adminUpdateCustomerHsRates(
  input: AdminUpdateCustomerHsRatesInput,
): Promise<AdminActionResult<{ crhsid: number; kg_writes: number; cbm_writes: number }>> {
  const parsed = hsUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin<{ crhsid: number; kg_writes: number; cbm_writes: number }>(
    ["accounting", "super"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Verify customer exists.
      const { data: customer, error: customerErr } = await admin
        .from("tb_users")
        .select("userID")
        .eq("userID", userid)
        .maybeSingle<{ userID: string }>();
      if (customerErr) {
        console.error(`[tb_users mutation lookup] failed`, { code: customerErr.code, message: customerErr.message });
        return { ok: false, error: `db_error:${customerErr.code ?? "unknown"}` };
      }
      if (!customer) return { ok: false, error: "ไม่พบลูกค้า (userid ไม่ตรงกับ tb_users)" };

      // Read the LATEST per-cell rate (max crhsid → first row per cell when
      // ordered desc) so we know rkgbefore / rcbmbefore for the diff.
      const [{ data: kgRaw }, { data: cbmRaw }] = await Promise.all([
        admin
          .from("tb_hs_rate_custom_kg")
          .select("id,sourcewarehouse,rtransporttype,rproductstype,rkg,crhsid")
          .eq("userid", userid)
          .order("crhsid", { ascending: false })
          .limit(500),
        admin
          .from("tb_hs_rate_custom_cbm")
          .select("id,sourcewarehouse,rtransporttype,rproductstype,rcbm,crhsid")
          .eq("userid", userid)
          .order("crhsid", { ascending: false })
          .limit(500),
      ]);
      type KgHist = { id: number; sourcewarehouse: string; rtransporttype: string; rproductstype: string; rkg: number | null; crhsid: number | null };
      type CbmHist = { id: number; sourcewarehouse: string; rtransporttype: string; rproductstype: string; rcbm: number | null; crhsid: number | null };
      const kgRows = (kgRaw ?? []) as unknown as KgHist[];
      const cbmRows = (cbmRaw ?? []) as unknown as CbmHist[];

      const key = (r: { sourcewarehouse: string; rtransporttype: string; rproductstype: string }) =>
        `${r.sourcewarehouse}|${r.rtransporttype}|${r.rproductstype}`;
      const kgLatest = new Map<string, number | null>();
      for (const r of kgRows) {
        const k = key(r);
        if (!kgLatest.has(k)) kgLatest.set(k, r.rkg != null ? Number(r.rkg) : null);
      }
      const cbmLatest = new Map<string, number | null>();
      for (const r of cbmRows) {
        const k = key(r);
        if (!cbmLatest.has(k)) cbmLatest.set(k, r.rcbm != null ? Number(r.rcbm) : null);
      }

      // Build the diff first — if nothing changed, skip the history insert
      // entirely (legacy fall-through: "if nothing differs, sweetalert=eUpdate
      // and DON'T touch tb_customrate_hs"). Saves an orphan history row.
      type KgChange = { sourcewarehouse: string; rtransporttype: string; rproductstype: string; before: number; after: number };
      type CbmChange = KgChange;
      const kgChanges: KgChange[] = [];
      const cbmChanges: CbmChange[] = [];
      for (const cell of d.cells) {
        const k = key(cell);
        if (cell.rkg != null) {
          const before = kgLatest.get(k);
          // legacy treats no-override as 0 (the customer's effective rate
          // comes from tb_settings; the form pre-fills the visible value).
          // We use the visible "before" as the snapshot — the client passes
          // the value it currently shows. To stay defensive we fall back
          // to 0 if no row exists yet (matches legacy NOT NULL constraint
          // on rkgbefore — `rkgbefore numeric(10,2) NOT NULL`).
          const beforeVal = before ?? 0;
          if (beforeVal !== cell.rkg) {
            kgChanges.push({
              sourcewarehouse: cell.sourcewarehouse,
              rtransporttype: cell.rtransporttype,
              rproductstype: cell.rproductstype,
              before: beforeVal,
              after: cell.rkg,
            });
          }
        }
        if (cell.rcbm != null) {
          const before = cbmLatest.get(k);
          const beforeVal = before ?? 0;
          if (beforeVal !== cell.rcbm) {
            cbmChanges.push({
              sourcewarehouse: cell.sourcewarehouse,
              rtransporttype: cell.rtransporttype,
              rproductstype: cell.rproductstype,
              before: beforeVal,
              after: cell.rcbm,
            });
          }
        }
      }

      if (kgChanges.length === 0 && cbmChanges.length === 0) {
        return { ok: false, error: "ไม่มีการเปลี่ยนแปลง — ทุก cell ยังเท่าเดิม" };
      }

      // INSERT the history header.
      const { data: histRow, error: histErr } = await admin
        .from("tb_customrate_hs")
        .insert({
          userid,
          adminid: legacyAdminId,
          date: new Date().toISOString(),
        })
        .select("id")
        .single<{ id: number }>();
      if (histErr || !histRow) {
        return { ok: false, error: `History insert failed: ${histErr?.message ?? "no row returned"}` };
      }
      const crhsid = histRow.id;

      // INSERT child KG rows.
      for (const ch of kgChanges) {
        const { error } = await admin.from("tb_hs_rate_custom_kg").insert({
          userid,
          sourcewarehouse: ch.sourcewarehouse,
          rtransporttype: ch.rtransporttype,
          rproductstype: ch.rproductstype,
          rkgbefore: ch.before,
          rkg: ch.after,
          adminidupdate: legacyAdminId,
          crhsid,
        });
        if (error) {
          return {
            ok: false,
            error: `History row id=${crhsid} created แต่ KG insert failed: ${error.message}`,
          };
        }
      }
      // INSERT child CBM rows.
      for (const ch of cbmChanges) {
        const { error } = await admin.from("tb_hs_rate_custom_cbm").insert({
          userid,
          sourcewarehouse: ch.sourcewarehouse,
          rtransporttype: ch.rtransporttype,
          rproductstype: ch.rproductstype,
          rcbmbefore: ch.before,
          rcbm: ch.after,
          adminidupdate: legacyAdminId,
          crhsid,
        });
        if (error) {
          return {
            ok: false,
            error: `History row id=${crhsid} created แต่ CBM insert failed: ${error.message}`,
          };
        }
      }

      await logAdminAction(adminId, "tb_customrate_hs.create", "tb_customrate_hs", String(crhsid), {
        userid,
        crhsid,
        kg_changes: kgChanges,
        cbm_changes: cbmChanges,
      });

      revalidatePath("/admin/rates/custom-hs");
      return {
        ok: true,
        data: { crhsid, kg_writes: kgChanges.length, cbm_writes: cbmChanges.length },
      };
    },
  );
}
