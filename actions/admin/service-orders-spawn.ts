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
import { checkCarrierForProvince } from "@/lib/forwarder/carrier-coverage-guard";
import { sendNotification } from "@/lib/notifications";
import { logger, redactId } from "@/lib/logger";
import { maybeCompleteShopOrder } from "@/lib/admin/maybe-complete-shop-order";
import { buildShopForwarderHandoff } from "@/lib/admin/shop-forwarder-handoff";

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
  trackings:  z.array(trackingEntrySchema).min(1, "ต้องมีอย่างน้อย 1 tracking").max(10_000),
});
export type SpawnForwardersInput = z.infer<typeof spawnSchema>;

type SpawnResult = {
  spawnedFNos: number[];
  skipped: number;
  created: number;
  promoRowsCarried: number;
  // True only when the canonical post-spawn re-derive actually moved the order
  // to 5 because every active import family was already done. Creating a new
  // fstatus=1 row by itself never advances/completes the shop order.
  statusCompleted: boolean;
};

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
  hstatus: string | null;
  hwarehousechina: string | null;
  tax_doc_pref: string | null;
  tax_doc_tax_id: string | null;
  tax_doc_address: string | null;
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
  // 2026-06-29 (fix #3) — crate flag + crate price carried into the spawned
  // tb_forwarder (legacy saveTarcking copies crate from the header · shops.php
  // L1403/L1433). pricecrate is a cost/charge field; on the forwarder it feeds
  // the import cost/invoice line, not the shop-order sell total.
  crate: string | null;
  pricecrate: number | string | null;
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
    ["super", "ops", "sales_admin", "accounting"],
    async ({ adminId }) => {
      const admin            = createAdminClient();
      const legacyAdminIdRaw = await resolveLegacyAdminId();
      const legacyAdminId    = legacyAdminIdRaw.slice(0, 10);  // varchar(10) cap

      // 1) Load header — the spawn copies userid + address + cover + carrier
      //    from this row (legacy shops.php L1631-1657).
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select(
          "hno,userid,hstatus,htitle,hcover,htransporttype,hshipby,hshippingservice,hfreeshipping,hpriceupdate,hrate,hwarehousechina,tax_doc_pref,tax_doc_tax_id,tax_doc_address,haddressname,haddresslastname,haddressno,haddresssubdistrict,haddressdistrict,haddressprovince,haddresszipcode,haddressnote,haddresstel,haddresstel2,crate,pricecrate",
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
      if (header.hstatus !== "4" && header.hstatus !== "40") {
        return {
          ok: false,
          error: `สร้างงานฝากนำเข้าได้เฉพาะออเดอร์รอร้านจีนจัดส่ง/ถึงโกดังจีน (4/40) · สถานะปัจจุบัน=${header.hstatus ?? "?"}`,
        };
      }

      const nowIso = new Date().toISOString();
      const spawnedFNos: number[] = [];
      const createdFNos: number[] = [];
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
          .neq("fstatus", "99")
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
        // 🔴 CLOSED LIST (owner 2026-07-14) — only when the admin OVERRIDES the carrier for
        // this tracking. Carrying `header.hshipby` through is exempt (`previous`), so an old
        // shop order holding a legacy free-text carrier ("สมใจสาย4" · "เรียกรถขนส่ง" — ~35 such
        // rows on prod) still spawns its forwarder rows.
        {
          const coverage = checkCarrierForProvince(fShipBy, header.haddressprovince, {
            previous: header.hshipby,
          });
          if (!coverage.ok) return { ok: false, error: coverage.error };
        }
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
        const handoff = buildShopForwarderHandoff({
          fShipBy,
          headerWarehouse: header.hwarehousechina,
          taxDocPref: header.tax_doc_pref,
          taxDocTaxId: header.tax_doc_tax_id,
          taxDocAddress: header.tax_doc_address,
          headerPriceUpdate: header.hpriceupdate,
        });
        const fPriceUpdate = t.fPriceUpdate ?? handoff.fallbackPriceUpdate;
        const fDetail      = (t.fDetail ?? header.htitle ?? "").slice(0, 500);
        const fCover       = (header.hcover ?? "").slice(0, 500);
        // 2026-06-29 (fix #3) — carry the header's crate flag + price into the
        // forwarder (legacy copies crate from the header on spawn). Default to
        // the legacy not-crated flag '2' + price 0 when the order has none.
        const fCrate       = (header.crate ?? "2").slice(0, 1) || "2";
        const fPriceCrate  = Number(header.pricecrate ?? 0) || 0;

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
            fwarehousechina:       handoff.fwarehousechina,
            // 2026-06-05 (ภูม flag — "spawn ขึ้นโกดัง แสง อัตโนมัติ"): the
            // shop-order auto-spawn doesn't know which China partner
            // warehouse the goods will arrive at (1=แสง 2=CTT 3=MK 4=MX
            // 5=JMF 6=GOGO 7=Cargo Center 8=MOMO). Leave blank — admin sets
            // it in /edit when the partner-API or manual confirmation lands.
            // Mirrors the fix on actions/admin/forwarders-new.ts:397.
            fwarehousename:        "",
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
            paymethod:             handoff.paymethod,
            tax_doc_pref:          handoff.tax_doc_pref,
            tax_doc_tax_id:        handoff.tax_doc_tax_id,
            tax_doc_address:       handoff.tax_doc_address,
            crate:                 fCrate,        // carried from header (fix #3)
            pricecrate:            fPriceCrate,   // carried from header (fix #3)
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
        createdFNos.push(row.id);
        created++;
      }

      // 3) Carry order promotions here (the single spawn SOT), so both the
      // per-tracking button and the bulk wrapper produce identical imports.
      // Also repairs a previously-spawned row on an idempotent re-run.
      let promoRowsCarried = 0;
      const { data: sourcePromos, error: sourcePromosErr } = await admin
        .from("tb_promotion")
        .select("promoid")
        .eq("hno", d.hNo);
      if (sourcePromosErr) {
        logger.warn("service_order.spawn_forwarders", "promotion source read failed", {
          h_no: d.hNo,
          error: sourcePromosErr.message,
        });
      } else {
        const promoIds = Array.from(new Set((sourcePromos ?? []).map((row) => row.promoid)));
        for (const promoid of promoIds) {
          for (const fid of spawnedFNos) {
            const { data: existingPromo, error: promoCheckErr } = await admin
              .from("tb_promotion")
              .select("id")
              .eq("promoid", promoid)
              .eq("fid", fid)
              .eq("hno", d.hNo)
              .limit(1)
              .maybeSingle<{ id: number }>();
            if (promoCheckErr || existingPromo) continue;
            const { error: promoInsertErr } = await admin.from("tb_promotion").insert({
              date: nowIso,
              promoid,
              fid,
              hno: d.hNo,
            });
            if (!promoInsertErr) promoRowsCarried += 1;
          }
        }
      }

      // 4) Audit log — record what spawned vs skipped (idempotent re-runs).
      await logAdminAction(adminId, "service_order.spawn_forwarders", "tb_header_order", d.hNo, {
        h_no:       d.hNo,
        admin_id:   legacyAdminId,
        spawned:    created,
        skipped:    skipped,
        f_nos:      spawnedFNos,
        tracking_count: d.trackings.length,
        promo_rows_carried: promoRowsCarried,
      });

      // 5) Customer notification — mirror legacy shops.php L1715 + L1720.
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
            const fNosLabel = createdFNos.map((id) => `#${id}`).join(", ");
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

      // 6) Re-derive from the canonical arrival rule. A freshly-created
      //    fstatus=1 row does not advance the shop order: 4→40 requires every
      //    parcel to arrive China, and →5 requires every parcel to be
      //    containered/at Thailand. Best-effort — the 0268 DB triggers remain
      //    the systemic writer and also handle rollback/delete.
      let statusCompleted = false;
      try {
        const gate = await maybeCompleteShopOrder(admin, d.hNo, {
          recomputeSell: true,
          legacyAdminId,
        });
        statusCompleted = gate.completed;
      } catch (err) {
        logger.warn("service_order.spawn_forwarders", "completion gate failed (non-fatal)", {
          h_no: d.hNo,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      revalidatePath(`/admin/service-orders/${d.hNo}`);
      revalidatePath("/admin/service-orders");
      revalidatePath("/admin/forwarders");
      return { ok: true, data: { spawnedFNos, created, skipped, promoRowsCarried, statusCompleted } };
    },
  );
}
