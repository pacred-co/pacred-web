"use server";

/**
 * Per-customer shipping-rate override — the legacy customer-profile
 * "ตั้งค่าเรทขนส่ง" (gear → #rate-settings) faithfully ported. (เดฟ 2026-05-30)
 *
 * 🎯 Why this exists (gap found 2026-05-30 audit):
 *   - The customer profile page (`customers/[id]`) was READ-ONLY — no rate
 *     editor at all, while legacy lets staff set a customer's sell rate
 *     right in the profile.
 *   - The pre-existing `/admin/rates/custom-hs` + `adminUpdateCustomerHsRates`
 *     wrote ONLY the history tables (tb_customrate_hs + tb_hs_rate_custom_*)
 *     and NEVER the LIVE rate tables (tb_rate_custom_kg/cbm) — so setting a
 *     per-user rate there had ZERO billing effect. Latent bug.
 *
 * This action does what legacy `users.php` (customRate handler, L333-593)
 * does: write the LIVE per-user rate (tb_rate_custom_kg + tb_rate_custom_cbm)
 * AND append a history snapshot (tb_customrate_hs + tb_hs_rate_custom_*),
 * per warehouse, in one save. The live tables are exactly what the legacy
 * forwarder price engine reads as the SVIP tier (see calPriceForwarder).
 *
 * Source verified directly from
 *   <legacy>/member/pcs-admin/users.php  L333-593.
 *
 * SVIP semantics (legacy): a customer "is SVIP" purely because a
 * tb_rate_custom_cbm row exists for them — no usertype/coid flip. We mirror.
 *
 * Encodings: sourceWarehouse 1=กวางโจว 2=อี้อู · rTransportType 1=รถ 2=เรือ
 * (per-user has NO air) · rProductsType 1 ทั่วไป 2 มอก. 3 อย./น้ำยา 4 พิเศษ.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  COST_FLOOR,
  DEFAULT_START,
  PRODUCTS,
  TRANSPORTS,
  WAREHOUSES,
  emptyMatrix,
  type CustomerRateMatrix,
  type ProductId,
  type RateMatrix,
  type TransportId,
  type WarehouseId,
} from "@/lib/admin/customer-rate-tables";

// ── resolveLegacyAdminId (duplicated · see rate-edits.ts note) ───────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[customer-rate auth.getUser] failed`, { code: authErr.code, message: authErr.message });
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
    console.error(`[customer-rate tb_admin] failed`, { code: error.code, message: error.message });
  }
  return (data?.adminID ?? email).slice(0, 10);
}

// ── types ────────────────────────────────────────────────────────────────
type LiveKgRow = {
  id: number;
  sourcewarehouse: string;
  rtransporttype: string;
  rproductstype: string;
  rkg: number | null;
  adminidupdate: string | null;
};
type LiveCbmRow = Omit<LiveKgRow, "rkg"> & { rcbm: number | null };

const cellKey = (t: string, p: string) => `${t}|${p}`;

// ── reader: current per-user rates (both warehouses) ──────────────────────
/**
 * Read a customer's live per-user rate matrix. Empty cells stay null (the
 * customer falls back to their VIP-group / general rate for that cell).
 * `isSvip` mirrors legacy: a tb_rate_custom_cbm row exists.
 */
export async function getCustomerRateMatrix(userid: string): Promise<CustomerRateMatrix> {
  const admin = createAdminClient();
  const uid = userid.trim();

  const [{ data: kgRaw, error: kgErr }, { data: cbmRaw, error: cbmErr }] = await Promise.all([
    admin
      .from("tb_rate_custom_kg")
      .select("id,sourcewarehouse,rtransporttype,rproductstype,rkg,adminidupdate")
      .eq("userid", uid)
      .limit(200),
    admin
      .from("tb_rate_custom_cbm")
      .select("id,sourcewarehouse,rtransporttype,rproductstype,rcbm,adminidupdate")
      .eq("userid", uid)
      .limit(200),
  ]);
  if (kgErr) console.error(`[getCustomerRateMatrix kg] failed`, { uid, code: kgErr.code, message: kgErr.message });
  if (cbmErr) console.error(`[getCustomerRateMatrix cbm] failed`, { uid, code: cbmErr.code, message: cbmErr.message });

  const kgRows = (kgRaw ?? []) as unknown as LiveKgRow[];
  const cbmRows = (cbmRaw ?? []) as unknown as LiveCbmRow[];

  const byWarehouse: Record<WarehouseId, RateMatrix> = {
    "1": emptyMatrix(),
    "2": emptyMatrix(),
  };
  const lastAdmin: Record<WarehouseId, string | null> = { "1": null, "2": null };

  for (const r of kgRows) {
    const wh = r.sourcewarehouse as WarehouseId;
    const t = r.rtransporttype as TransportId;
    const p = r.rproductstype as ProductId;
    if (!byWarehouse[wh]?.kg[t]) continue;
    byWarehouse[wh].kg[t][p] = r.rkg != null ? Number(r.rkg) : null;
    if (r.adminidupdate) lastAdmin[wh] = r.adminidupdate;
  }
  for (const r of cbmRows) {
    const wh = r.sourcewarehouse as WarehouseId;
    const t = r.rtransporttype as TransportId;
    const p = r.rproductstype as ProductId;
    if (!byWarehouse[wh]?.cbm[t]) continue;
    byWarehouse[wh].cbm[t][p] = r.rcbm != null ? Number(r.rcbm) : null;
    if (r.adminidupdate) lastAdmin[wh] = r.adminidupdate;
  }

  return { isSvip: cbmRows.length > 0, byWarehouse, lastAdmin };
}

// ── writer: save one warehouse's full 8-cell matrix (live + history) ──────
const cellSchema = z.object({
  t: z.enum(["1", "2"]),
  p: z.enum(["1", "2", "3", "4"]),
  rkg: z.number().min(0), // 0 = ไม่คิดตามน้ำหนัก (legacy stores 0 for CBM-only customers)
  rcbm: z.number().min(0),
});
const saveSchema = z.object({
  userid: z.string().trim().min(1).max(10),
  sourceWarehouse: z.enum(["1", "2"]),
  cells: z.array(cellSchema).length(8),
});
export type SaveCustomerRateInput = z.infer<typeof saveSchema>;

export async function adminSaveCustomerRate(
  input: SaveCustomerRateInput,
): Promise<AdminActionResult<{ changed: number; created: boolean; belowFloor: number }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const userid = d.userid.toUpperCase();
  const wh = d.sourceWarehouse;

  // All 8 (transport × product) combos must be present exactly once.
  const cellMap = new Map<string, { t: TransportId; p: ProductId; rkg: number; rcbm: number }>();
  for (const c of d.cells) cellMap.set(cellKey(c.t, c.p), c);
  for (const t of TRANSPORTS) {
    for (const p of PRODUCTS) {
      if (!cellMap.has(cellKey(t.id, p.id))) {
        return { ok: false, error: `ขาดเรท ${t.short}/${p.label} — ต้องกรอกครบทุกช่อง` };
      }
    }
  }

  // Floor enforcement is HARD now (ภูม 2026-06-19: "เผื่อพนักงานตั้งผิดจะได้กดไม่ได้ ·
  // จะ VIP แค่ไหนก็ห้ามขายต่ำกว่าราคาที่ภูมิบอกไว้") — but computed INSIDE withAdmin
  // (below), after reading the existing rows, so we GRANDFATHER legacy below-floor
  // data: only a NEWLY-set below-floor value blocks the save (an untouched legacy
  // cell never breaks an unrelated edit). A 0 = "ไม่คิดตามหน่วยนี้" → never below.
  return withAdmin<{ changed: number; created: boolean; belowFloor: number }>(
    ["super", "accounting", "sales_admin"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Verify the customer exists.
      const { data: customer, error: custErr } = await admin
        .from("tb_users")
        .select("userID,userCompany")
        .eq("userID", userid)
        .maybeSingle<{ userID: string; userCompany: string | null }>();
      if (custErr) {
        console.error(`[customer-rate tb_users] failed`, { userid, code: custErr.code, message: custErr.message });
        return { ok: false, error: `db_error:${custErr.code ?? "unknown"}` };
      }
      if (!customer) return { ok: false, error: "ไม่พบลูกค้า (userid ไม่ตรงกับ tb_users)" };

      // Read existing live rows for this (userid, warehouse).
      const [{ data: kgRaw, error: kgErr }, { data: cbmRaw, error: cbmErr }] = await Promise.all([
        admin
          .from("tb_rate_custom_kg")
          .select("id,rtransporttype,rproductstype,rkg")
          .eq("userid", userid)
          .eq("sourcewarehouse", wh),
        admin
          .from("tb_rate_custom_cbm")
          .select("id,rtransporttype,rproductstype,rcbm")
          .eq("userid", userid)
          .eq("sourcewarehouse", wh),
      ]);
      if (kgErr || cbmErr) {
        return { ok: false, error: `lookup failed: ${(kgErr ?? cbmErr)?.message}` };
      }
      type ExKg = { id: number; rtransporttype: string; rproductstype: string; rkg: number | null };
      type ExCbm = { id: number; rtransporttype: string; rproductstype: string; rcbm: number | null };
      const kgIdx = new Map<string, ExKg>(((kgRaw ?? []) as unknown as ExKg[]).map((r) => [cellKey(r.rtransporttype, r.rproductstype), r]));
      const cbmIdx = new Map<string, ExCbm>(((cbmRaw ?? []) as unknown as ExCbm[]).map((r) => [cellKey(r.rtransporttype, r.rproductstype), r]));

      // ── HARD floor enforcement (ภูม 2026-06-19) ────────────────────────────
      // Block a NEWLY-set sell rate below the per-warehouse ราคาขั้นต่ำ. We
      // GRANDFATHER an unchanged legacy cell (existing == entered) so an
      // unrelated save on an old below-floor customer isn't broken (กันงานหาย).
      // belowFloor = total below-floor cells (for the audit); blocked = the
      // NEW ones that gate the save.
      let belowFloor = 0;
      const blocked: string[] = [];
      for (const c of d.cells) {
        const k = cellKey(c.t, c.p);
        const cbmFloor = COST_FLOOR[wh].cbm[c.t][c.p];
        const kgFloor = COST_FLOOR[wh].kg[c.t][c.p];
        const tS = TRANSPORTS.find((x) => x.id === c.t)?.short ?? c.t;
        const pL = PRODUCTS.find((x) => x.id === c.p)?.label ?? c.p;
        if (c.rcbm > 0 && cbmFloor != null && c.rcbm < cbmFloor) {
          belowFloor++;
          const exCbm = cbmIdx.get(k)?.rcbm;
          if (!(exCbm != null && Number(exCbm) === c.rcbm)) {
            blocked.push(`CBM ${tS}/${pL} ฿${c.rcbm} (ขั้นต่ำ ฿${cbmFloor})`);
          }
        }
        if (c.rkg > 0 && kgFloor != null && c.rkg < kgFloor) {
          belowFloor++;
          const exKg = kgIdx.get(k)?.rkg;
          if (!(exKg != null && Number(exKg) === c.rkg)) {
            blocked.push(`KG ${tS}/${pL} ฿${c.rkg} (ขั้นต่ำ ฿${kgFloor})`);
          }
        }
      }
      if (blocked.length > 0) {
        return {
          ok: false,
          error:
            `ห้ามตั้งเรทขายต่ำกว่าราคาขั้นต่ำ — ${blocked.join(" · ")}. ` +
            `ปรับขึ้นอย่างน้อยเท่าราคาขั้นต่ำก่อนบันทึก (ถ้าจำเป็นต้องต่ำกว่านี้ ให้ Ultra Admin Z แก้ราคาขั้นต่ำ)`,
        };
      }

      const created = cbmIdx.size === 0; // legacy: "is this a fresh per-user setup?"

      // Per-cell UPSERT (read-then-update-or-insert) — more robust than the
      // legacy all-8 UPDATE which silently no-ops on a missing cell.
      type Change = { t: string; p: string; kgBefore: number; kgAfter: number; cbmBefore: number; cbmAfter: number; kgChanged: boolean; cbmChanged: boolean };
      const changes: Change[] = [];

      for (const c of d.cells) {
        const k = cellKey(c.t, c.p);
        const exKg = kgIdx.get(k);
        const exCbm = cbmIdx.get(k);
        // "before" baseline = existing custom value, else the legacy default-start.
        const kgBefore = exKg?.rkg != null ? Number(exKg.rkg) : DEFAULT_START[wh].kg[c.t as TransportId][c.p as ProductId] ?? 0;
        const cbmBefore = exCbm?.rcbm != null ? Number(exCbm.rcbm) : DEFAULT_START[wh].cbm[c.t as TransportId][c.p as ProductId] ?? 0;

        // KG upsert
        if (exKg) {
          if (Number(exKg.rkg) !== c.rkg) {
            const { error } = await admin.from("tb_rate_custom_kg")
              .update({ rkg: c.rkg, adminidupdate: legacyAdminId })
              .eq("id", exKg.id);
            if (error) return { ok: false, error: `KG update [${k}]: ${error.message}` };
          }
        } else {
          const { error } = await admin.from("tb_rate_custom_kg").insert({
            userid, sourcewarehouse: wh, rtransporttype: c.t, rproductstype: c.p, rkg: c.rkg, adminidupdate: legacyAdminId,
          });
          if (error) return { ok: false, error: `KG insert [${k}]: ${error.message}` };
        }
        // CBM upsert
        if (exCbm) {
          if (Number(exCbm.rcbm) !== c.rcbm) {
            const { error } = await admin.from("tb_rate_custom_cbm")
              .update({ rcbm: c.rcbm, adminidupdate: legacyAdminId })
              .eq("id", exCbm.id);
            if (error) return { ok: false, error: `CBM update [${k}]: ${error.message}` };
          }
        } else {
          const { error } = await admin.from("tb_rate_custom_cbm").insert({
            userid, sourcewarehouse: wh, rtransporttype: c.t, rproductstype: c.p, rcbm: c.rcbm, adminidupdate: legacyAdminId,
          });
          if (error) return { ok: false, error: `CBM insert [${k}]: ${error.message}` };
        }

        const kgChanged = kgBefore !== c.rkg;
        const cbmChanged = cbmBefore !== c.rcbm;
        if (kgChanged || cbmChanged) {
          changes.push({ t: c.t, p: c.p, kgBefore, kgAfter: c.rkg, cbmBefore, cbmAfter: c.rcbm, kgChanged, cbmChanged });
        }
      }

      // History snapshot (only when something changed — legacy fall-through).
      let crhsid: number | null = null;
      if (changes.length > 0) {
        const { data: histRow, error: histErr } = await admin
          .from("tb_customrate_hs")
          .insert({ userid, adminid: legacyAdminId, date: new Date().toISOString() })
          .select("id")
          .single<{ id: number }>();
        if (histErr || !histRow) {
          return { ok: false, error: `History header insert failed: ${histErr?.message ?? "no row"}` };
        }
        crhsid = histRow.id;

        for (const ch of changes) {
          if (ch.kgChanged) {
            const { error } = await admin.from("tb_hs_rate_custom_kg").insert({
              userid, sourcewarehouse: wh, rtransporttype: ch.t, rproductstype: ch.p,
              rkgbefore: ch.kgBefore, rkg: ch.kgAfter, adminidupdate: legacyAdminId, crhsid,
            });
            if (error) return { ok: false, error: `history KG [${ch.t}|${ch.p}]: ${error.message}` };
          }
          if (ch.cbmChanged) {
            const { error } = await admin.from("tb_hs_rate_custom_cbm").insert({
              userid, sourcewarehouse: wh, rtransporttype: ch.t, rproductstype: ch.p,
              rcbmbefore: ch.cbmBefore, rcbm: ch.cbmAfter, adminidupdate: legacyAdminId, crhsid,
            });
            if (error) return { ok: false, error: `history CBM [${ch.t}|${ch.p}]: ${error.message}` };
          }
        }
      }

      await logAdminAction(adminId, "tb_rate_custom.save", "tb_rate_custom", `${userid}/${wh}`, {
        userid,
        sourceWarehouse: wh,
        warehouse: WAREHOUSES.find((w) => w.id === wh)?.short,
        created,
        crhsid,
        changed: changes.length,
        belowFloor,
      });

      revalidatePath(`/admin/customers/${userid}`);
      return { ok: true, data: { changed: changes.length, created, belowFloor } };
    },
  );
}
