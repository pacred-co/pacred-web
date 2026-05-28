"use server";

/**
 * Admin > "บันทึก และสร้างรายการฝากนำเข้า" — shop→forwarder auto-spawn.
 *
 * Wave 21 P0 · Task #106 · 2026-05-26 — closes the biggest single backlog
 * gap per `docs/learnings/pacred-order-taxonomy.md` §6 + §7 ("Pacred's
 * /admin/forwarders list looks shorter than legacy because the spawn isn't
 * ported"). Legacy SOT: `pcs-admin/shops.php` L1584 + L1675-1721 +
 * `include/pages/shops/update/update4.php` L88-116.
 *
 * Lifecycle (matches legacy chronology — taxonomy §2):
 *   (1) customer cart-checkout      → tb_header_order row (hNo='Pxxxxx', hStatus=1)
 *   (2) customer pays                → hStatus advances (paid)
 *   (3) admin types per-tracking     → opens /admin/service-orders/[hNo] inline form
 *   (4) admin submits this action    → one tb_forwarder row PER cTrackingNumber
 *                                       with refOrder=hNo + adminIDCreator=<staff>
 *                                       + 9 hAddress* fields copied from header
 *                                       + fCover copied from header.hcover
 *   (5) downstream forwarder runs    → status flips 1..7 independently
 *
 * Idempotency: pre-INSERT SELECT on (refOrder, fTrackingCHN) — if a row
 * already exists, skip + push existing id to spawnedFNos. Prevents
 * duplicate spawns from admin double-click / re-submit of the same tracking.
 *
 * Notification: after each spawn, mirror legacy `shops.php` L1715 — fire a
 * "ฝากนำเข้าใหม่อัตโนมัติจากออเดอร์ฝากสั่งซื้อ #<hNo>" notification per
 * customer (resolved via tb-users-resolver). Wave 17 close-out commit
 * `01fdebc` already wires the underlying sendNotification + LINE-push
 * channel — we reuse `notify.forwarderCreated` template (templates.ts L187)
 * and append the "อัตโนมัติจาก #hNo" line in the body via a custom payload.
 *
 * Role gate: ops + sales_admin (the legacy `pcs-admin/shops.php` runs
 * under any admin · Pacred enforces a narrower set so warehouse/driver
 * can't trigger spawns).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { sendNotification } from "@/lib/notifications";
import { logger, redactId } from "@/lib/logger";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — clip to 10 chars (tb_forwarder.adminid* is varchar(10)).
// Same pattern as forwarders-new.ts L55. Extract to common.ts when N≥3.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[supabase.auth.getUser] failed`, { code: authErr.code, message: authErr.message });
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
    console.error(`[tb_admin lookup] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return email.slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// Input schema — one tracking entry per cShippingNumber line.
// Legacy form posts ONE row at a time (update4.php L90); this action
// supports both single (1-entry array) and bulk (N entries) shapes.
// ────────────────────────────────────────────────────────────

const TRANSPORT_TYPES = ["1", "2", "3"] as const;  // 1=รถ 2=เรือ 3=อากาศ (legacy modal supports 1+2; we accept 3 for forward-compat)

const trackingEntrySchema = z.object({
  cTrackingNumber:   z.string().trim().min(1, "กรอกเลข Tracking จีน").max(50),
  cShippingNumber:   z.string().trim().max(500).optional(),  // legacy doesn't carry this in INSERT but useful for audit
  fShipBy:           z.string().trim().min(1).max(10).optional(),  // fall back to header.hShipBy
  fTransportType:    z.enum(TRANSPORT_TYPES).optional(),  // fall back to header.hTransportType
  fShippingService:  z.number().nonnegative().optional(),
  fFreeShipping:     z.string().max(1).optional(),
  fPriceUpdate:      z.number().nonnegative().optional(),
  fDetail:           z.string().trim().max(500).optional(),
});

const spawnSchema = z.object({
  hNo:        z.string().trim().min(1, "missing hNo").max(30),
  trackings:  z.array(trackingEntrySchema).min(1, "ต้องมีอย่างน้อย 1 tracking").max(50),
});
export type SpawnForwardersInput = z.infer<typeof spawnSchema>;

type SpawnResult = { spawnedFNos: number[]; skipped: number; created: number };

// tb_header_order row shape — only the columns we copy into tb_forwarder.
type HeaderRow = {
  hno: string;
  userid: string;
  htitle: string | null;
  hcover: string | null;
  htransporttype: string | null;
  hshipby: string | null;
  hshippingservice: number | null;
  hfreeshipping: string | null;
  hpriceupdate: number | null;
  hrate: number | null;
  haddressname: string | null;
  haddresslastname: string | null;
  haddressno: string | null;
  haddresssubdistrict: string | null;
  haddressdistrict: string | null;
  haddressprovince: string | null;
  haddresszipcode: string | null;
  haddressnote: string | null;
  haddresstel: string | null;
  haddresstel2: string | null;
};

export async function spawnForwardersFromShopOrder(
  rawInput: SpawnForwardersInput,
): Promise<AdminActionResult<SpawnResult>> {
  const parsed = spawnSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<SpawnResult>(
    ["ops", "sales_admin", "accounting"],
    async ({ adminId }) => {
      const admin            = createAdminClient();
      const legacyAdminIdRaw = await resolveLegacyAdminId();
      const legacyAdminId    = legacyAdminIdRaw.slice(0, 10);  // varchar(10) cap

      // 1) Load header — the spawn copies userid + address + cover + carrier
      //    from this row (legacy shops.php L1631-1657).
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select(
          "hno,userid,htitle,hcover,htransporttype,hshipby,hshippingservice,hfreeshipping,hpriceupdate,hrate,haddressname,haddresslastname,haddressno,haddresssubdistrict,haddressdistrict,haddressprovince,haddresszipcode,haddressnote,haddresstel,haddresstel2",
        )
        .eq("hno", d.hNo)
        .maybeSingle<HeaderRow>();
      if (headerErr) {
        console.error(`[tb_header_order lookup] failed`, {
          code: headerErr.code, message: headerErr.message, hint: headerErr.hint,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) {
        return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hNo ไม่ตรง)" };
      }

      const nowIso = new Date().toISOString();
      const spawnedFNos: number[] = [];
      let created = 0;
      let skipped = 0;

      // 2) Per-tracking loop — INSERT one tb_forwarder per cTrackingNumber.
      //    Idempotency: pre-SELECT on (refOrder, fTrackingCHN). Abort the
      //    whole loop on the first INSERT error (no partial-spawn — legacy
      //    behaviour was "one POST = one INSERT"; our bulk wrapper either
      //    succeeds for all OR aborts so the operator can re-submit).
      for (const t of d.trackings) {
        const fTrackingCHN = t.cTrackingNumber.trim();
        if (!fTrackingCHN) continue;

        // Idempotency check — refOrder + fTrackingCHN is the natural key.
        const { data: existing, error: existingErr } = await admin
          .from("tb_forwarder")
          .select("id")
          .eq("reforder", d.hNo)
          .eq("ftrackingchn", fTrackingCHN)
          .limit(1)
          .maybeSingle<{ id: number }>();
        if (existingErr) {
          console.error(`[tb_forwarder idempotency check] failed`, {
            code: existingErr.code, message: existingErr.message,
          });
          return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
        }
        if (existing?.id) {
          spawnedFNos.push(existing.id);
          skipped++;
          continue;
        }

        // fShipBy / fTransportType — prefer per-tracking override, else header.
        const fShipBy        = (t.fShipBy ?? header.hshipby ?? "PCS").slice(0, 10);
        const fTransportType = (t.fTransportType ?? header.htransporttype ?? "1").slice(0, 1);
        const fFreeShipping  = (t.fFreeShipping ?? header.hfreeshipping ?? "0").slice(0, 1);
        // fShippingService — legacy shops.php L1671-1673: 0 always when fShipBy='PCSF',
        // else fall back to header.hShippingService. Per-tracking override wins.
        const fShippingService =
          fShipBy === "PCSF"
            ? 0
            : (t.fShippingService ?? Number(header.hshippingservice ?? 0));
        // fPriceUpdate — legacy shops.php L1658: round_up(cPriceUpdate * hRate, 2).
        // Per-tracking override is in THB already (caller computes); we don't
        // re-multiply by hRate (Pacred form posts pre-converted value).
        const fPriceUpdate = t.fPriceUpdate ?? 0;
        const fDetail      = (t.fDetail ?? header.htitle ?? "").slice(0, 500);
        const fCover       = (header.hcover ?? "").slice(0, 500);

        const { data: row, error: insErr } = await admin
          .from("tb_forwarder")
          .insert({
            // ─── 19 legacy INSERT columns (shops.php L1677-1683) ───
            ffreeshipping:        fFreeShipping,
            ftrackingchn:         fTrackingCHN,
            fdetail:              fDetail,
            fdate:                nowIso,
            userid:               header.userid,
            fshipby:              fShipBy,
            fcover:               fCover,
            fpriceupdate:         fPriceUpdate,
            ftransporttype:       fTransportType,
            adminidcreator:       legacyAdminId,
            faddressname:         header.haddressname ?? "",
            faddresslastname:     header.haddresslastname ?? "",
            faddressno:           header.haddressno ?? "",
            faddresssubdistrict:  header.haddresssubdistrict ?? "",
            faddressdistrict:     header.haddressdistrict ?? "",
            faddressprovince:     header.haddressprovince ?? "",
            faddresszipcode:      header.haddresszipcode ?? "",
            faddressnote:         header.haddressnote ?? "",
            faddresstel:          header.haddresstel ?? "",
            faddresstel2:         header.haddresstel2 ?? "",
            reforder:             d.hNo,
            fshippingservice:     fShippingService,

            // ─── safe defaults for remaining NOT NULL columns (mirrors
            //     forwarders-new.ts pattern; legacy PHP relies on DB defaults
            //     or empty strings for unset fields) ───
            fstatus:               "1",   // รอเข้าโกดังจีน
            paydeposit:            "0",
            fwarehousechina:       "1",   // กวางโจว default
            fwarehousename:        "1",
            fcabinetnumber:        "",
            ftrackingth:           "-",
            famount:               1,
            fnote:                 null,
            fnoteuser:             "0",
            fnoteuserread:         "0",
            fphotoend:             "",
            fproductstype:         "1",
            fweight:               0,
            fwidth:                0,
            flength:               0,
            fheight:               0,
            fvolume:               0,
            customratekg:          0,
            customratecbm:         0,
            customrate:            "0",
            frefprice:             "0",
            frefrate:              0,
            fcostrefrate:          0,
            ftransportprice:       0,
            fdiscount:             0,
            ftotalprice:           0,
            fcosttotalprice:       0,
            fcosttotalpricesheet:  0,
            fprofittransportchn:   0,
            fprofitpriceupdate:    0,
            fprofittotal:          0,
            faddresslatitude:      0,
            faddresslongitude:     0,
            adminid:               legacyAdminId,
            adminidkey:            "",
            adminidupdate:         legacyAdminId,
            session:               "shop-spawn",
            fcredit:               "0",
            fusercompany:          "0",
            fsendsms1day:          "0",
            fsendsms3day:          "0",
            fsendsms3eday:         "0",
            paymethod:             "1",
            crate:                 "2",
            pricecrate:            0,
            fqc:                   "0",
            fqcprice:              0,
            ftransportpricechnthb: 0,
            pricemore:             "0",
            priceother:            0,
            linkapiorder:          "0",
            subuserid:             "",
            fstatuscaron:          "0",
            fstatuscaradminon:     "",
            fstatuscaroff:         "0",
            fstatuscaradminoff:    "",
            printstatus1:          "0",
            printstatus2:          "0",
            printstatus3:          "0",
            printstatus4:          "0",
          })
          .select("id")
          .single<{ id: number }>();

        if (insErr || !row) {
          console.error(`[tb_forwarder spawn insert] failed`, {
            code: insErr?.code, message: insErr?.message, hint: insErr?.hint,
            hNo: d.hNo, tracking: fTrackingCHN,
          });
          return {
            ok: false,
            error: `spawn failed at tracking ${fTrackingCHN}: ${insErr?.message ?? "no row returned"} (${created} created, ${skipped} skipped before abort)`,
          };
        }

        spawnedFNos.push(row.id);
        created++;
      }

      // 3) Audit log — record what spawned vs skipped (idempotent re-runs).
      await logAdminAction(adminId, "service_order.spawn_forwarders", "tb_header_order", d.hNo, {
        h_no:       d.hNo,
        admin_id:   legacyAdminId,
        spawned:    created,
        skipped:    skipped,
        f_nos:      spawnedFNos,
        tracking_count: d.trackings.length,
      });

      // 4) Customer notification — mirror legacy shops.php L1715 + L1720.
      //    One notification per spawn (not per skipped); message says
      //    "รายการอัตโนมัติจากออเดอร์ฝากสั่งซื้อ #<hNo>" so the customer
      //    understands the link to their shop order.
      if (created > 0) {
        try {
          const profileMap = await resolveProfileIdsForLegacyUserids([header.userid]);
          const profileId = profileMap.get(header.userid);
          if (profileId) {
            // Aggregate notification — one push per spawn batch (a single
            // admin submit). Avoids 10× spam if the operator bulk-spawns.
            const fNosLabel = spawnedFNos.slice(-created).map((id) => `#${id}`).join(", ");
            await sendNotification(profileId, {
              category:       "forwarder",
              severity:       "success",
              title:          `ฝากนำเข้าใหม่ ${created} รายการ — จากออเดอร์ฝากสั่งซื้อ #${d.hNo}`,
              body:           `เลขที่ฝากนำเข้า: ${fNosLabel}\nสถานะ: รอสินค้าเข้าโกดังจีน`,
              link_href:      `/service-import`,
              reference_type: "service_order",
              reference_id:   d.hNo,
            });
          } else {
            logger.warn("service_order.spawn_forwarders", "no profile for userid — skipping notification", {
              userid: redactId(header.userid),
              h_no:   d.hNo,
            });
          }
        } catch (err) {
          // Non-fatal — the spawn already succeeded; notification failure
          // shouldn't bounce the action result. Legacy `sendLine` also
          // failed silently on missing token.
          logger.warn("service_order.spawn_forwarders", "notification dispatch failed", {
            h_no:  d.hNo,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      revalidatePath(`/admin/service-orders/${d.hNo}`);
      revalidatePath("/admin/service-orders");
      revalidatePath("/admin/forwarders");
      return { ok: true, data: { spawnedFNos, created, skipped } };
    },
  );
}
