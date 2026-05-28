/**
 * GET /api/cron/cargothai-sync — Sprint-7 foundation (Gap #4).
 *
 * Daily cron that pulls the previous day's container + item data from
 * CargoThai's GetContainerV2 endpoint into the tb_tmp_forwarder_* tables.
 * Wraps `adminSyncCargoThai` (the same action the /admin/cargothai
 * manual-sync button calls) so the upsert logic stays in one place.
 *
 * Suggested schedule: `30 19 * * *` (19:30 UTC = 02:30 ICT next day).
 * Registered in vercel.json. Quietly no-ops with status='failure' when
 * PACRED_CARGOTHAI_TOKEN env is unset — keeps the cron-invocations
 * log clean without crashing the route.
 *
 * Auth: instrumentCron handles the CRON_SECRET / x-vercel-cron header
 * check — same pattern as the other crons.
 */
import { instrumentCron } from "@/lib/cron/instrument";
import { fetchContainers, normaliseUserId, splitSmCode } from "@/lib/integrations/cargothai/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const MAX_PAGES = 5;

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/cargothai-sync",
    request,
    handler: async () => {
      // Default window: yesterday through today (cron runs at 02:30 ICT
      // so the API returns the previous calendar day's manifests).
      const today = new Date();
      const yday  = new Date(today.getTime() - 86_400_000);
      const fmt   = (d: Date) => d.toISOString().slice(0, 10);
      const from  = fmt(yday);
      const to    = fmt(today);

      const admin = createAdminClient();
      const nowIso = new Date().toISOString();

      let containersScanned = 0;
      let containersInserted = 0;
      let containersUpdated  = 0;
      let itemsScanned       = 0;
      let itemsInserted      = 0;
      let itemsUpdated       = 0;
      let pagesFetched       = 0;

      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await fetchContainers({ from, to, page });
        pagesFetched = page;

        if (!res.ok) {
          if (res.reason === "not_configured") {
            // Foundation status — token not yet provisioned.
            return {
              status:  "failure",
              summary: { reason: "not_configured", pagesFetched },
              payload: { ok: false, error: "PACRED_CARGOTHAI_TOKEN not set" },
            };
          }
          logger.warn("cargothai-cron", "page fetch failed", {
            page, reason: res.reason, http: res.httpStatus, message: res.message,
          });
          return {
            status:  "failure",
            summary: { reason: res.reason, page, pagesFetched },
            payload: { ok: false, error: `cargothai_sync: ${res.reason}` },
          };
        }

        containersScanned += res.containers.length;

        for (const c of res.containers) {
          if (!c.sm_code) continue;

          const userID = normaliseUserId(c);
          const { sm, hNo } = splitSmCode(c.sm_code);

          // Container upsert
          const { data: existing, error: existingErr } = await admin
            .from("tb_tmp_forwarder_cargothai")
            .select("sm_code")
            .eq("sm_code", c.sm_code)
            .maybeSingle<{ sm_code: string }>();
          if (existingErr) {
            console.error(`[tb_tmp_forwarder_cargothai list] failed`, { code: existingErr.code, message: existingErr.message });
          }

          const payload = {
            smid:                String(c.id ?? ""),
            customer_code:       c.customer_code ?? c.costomer_code ?? "",
            order_no:            c.order_no ?? "",
            updated_at:          c.updated_at ?? null,
            tracking:            c.tracking ?? "",
            container_name:      c.container_name ?? "",
            container_code:      c.container_code ?? "",
            due_date:            c.due_date ?? null,
            box_total:           c.box_total ?? null,
            box_weight:          c.box_weight ?? null,
            box_cbm:             c.box_cbm ?? null,
            sm_code:             c.sm_code,
            sm_date:             c.sm_date ?? null,
            manifest_date:       c.manifest_date ?? null,
            estimated_date:      c.estimated_date ?? null,
            etd:                 c.etd ?? null,
            eta:                 c.eta ?? null,
            re:                  c.re ?? "",
            created_at:          c.created_at ?? null,
            note:                c.note ?? "",
            note_amount:         c.note_amount ?? null,
            transport_name:      c.transport_name ?? "",
            transport_code:      c.transport_code ?? "",
            warehouse_name:      c.warehouse_name ?? "",
            warehouse_code:      c.warehouse_code ?? "",
            sm,
            userid:              userID,
            hno:                 hNo,
            api_lasttimeupdated: nowIso,
          };
          if (existing) {
            const { error } = await admin
              .from("tb_tmp_forwarder_cargothai")
              .update(payload)
              .eq("sm_code", c.sm_code);
            if (!error) containersUpdated += 1;
          } else {
            const { error } = await admin
              .from("tb_tmp_forwarder_cargothai")
              .insert(payload);
            if (!error) containersInserted += 1;
          }

          // Items
          for (const p of (c.product_list ?? [])) {
            if (p.product_id == null || p.product_id === "") continue;
            itemsScanned += 1;

            const tracking = (p.product_tracking ?? "").toString().trim() || sm;

            const { data: existingItem, error: existingItemErr } = await admin
              .from("tb_tmp_forwarder_item_cargothai")
              .select("productid")
              .eq("productid", String(p.product_id))
              .maybeSingle<{ productid: string }>();
            if (existingItemErr) {
              console.error(`[tb_tmp_forwarder_item_cargothai list] failed`, { code: existingItemErr.code, message: existingItemErr.message });
            }

            if (existingItem) {
              const { error } = await admin
                .from("tb_tmp_forwarder_item_cargothai")
                .update({
                  productqty:          p.product_qty ?? null,
                  productweightall:    p.product_weight_all ?? null,
                  productcbmall:       p.product_cbm_all ?? null,
                  productweightformat: p.product_weight_format ?? "",
                  containercode:       c.container_code ?? "",
                  userid:              userID,
                  date:                c.sm_date ?? null,
                  lasttimeupdated:     nowIso,
                  adminid:             "admin_tam",
                  adminidupdated:      "admin_tam",
                  productcostchn:      c.note_amount ?? null,
                  transport_code:      c.transport_code ?? "",
                })
                .eq("productid", String(p.product_id));
              if (!error) itemsUpdated += 1;
            } else {
              const { error } = await admin
                .from("tb_tmp_forwarder_item_cargothai")
                .insert({
                  productid:            String(p.product_id),
                  productname:          p.product_name ?? "",
                  producttracking:      tracking,
                  producttrackingnote:  p.product_tracking_note ?? "",
                  productqty:           p.product_qty ?? null,
                  productbagid:         "",
                  productwidth:         p.product_width ?? null,
                  productlength:        p.product_length ?? null,
                  productheight:        p.product_height ?? null,
                  productweightperitem: p.product_weight_per_item ?? null,
                  productweightall:     p.product_weight_all ?? null,
                  productcbmperitem:    p.product_cbm_per_item ?? null,
                  productcbmall:        p.product_cbm_all ?? null,
                  productweightformat:  p.product_weight_format ?? "",
                  producttypecode:      p.product_type_code ?? "",
                  containercode:        c.container_code ?? "",
                  userid:               userID,
                  fid:                  "",
                  date:                 c.sm_date ?? null,
                  lasttimeupdated:      nowIso,
                  adminid:              "admin_tam",
                  adminidupdated:       "admin_tam",
                  sm_code:              c.sm_code,
                  sm,
                  container_code:       c.container_code ?? "",
                  productcostchn:       c.note_amount ?? null,
                  transport_code:       c.transport_code ?? "",
                });
              if (!error) itemsInserted += 1;
            }
          }
        }

        if (!res.hasMore) break;
      }

      return {
        status:  "success",
        summary: {
          pagesFetched,
          containersScanned, containersInserted, containersUpdated,
          itemsScanned, itemsInserted, itemsUpdated,
        },
        payload: {
          ok: true,
          window: { from, to },
          pagesFetched,
          containersScanned, containersInserted, containersUpdated,
          itemsScanned, itemsInserted, itemsUpdated,
        },
      };
    },
  });
}
