"use server";

/**
 * Admin > "เพิ่มรายการให้ลูกค้า" — server action for /admin/forwarders/new.
 *
 * Faithful port of the legacy `pcs-admin/forwarder.php?page=add` admin
 * branch (D1 / ADR-0017 · Wave 12-C). Lets an operator create a
 * `tb_forwarder` row on a customer's behalf — the typical scenario is
 * a phone call where the customer asks the desk to log a parcel for them.
 *
 * Why admin-initiated INSERT is its own file (vs `actions/admin/forwarders.ts`):
 *   `forwarders.ts` mutates EXISTING rows on either the REBUILT `forwarders`
 *   table or legacy `tb_forwarder` (mostly status flips + payment marks).
 *   Mixing a fresh-INSERT path there would let someone import the wrong
 *   action from the same module. Keep them separate during the D1 transition.
 *
 * Source-badge convention (Wave 11):
 *   - `adminidcreator = ''`       → customer-initiated (the customer used
 *     /service-import/add themselves)
 *   - `adminidcreator = <non-empty>` → admin-initiated (this action stamps
 *     the calling admin's legacy id here)
 *   - `reforder = ''`             → not system-replicated (one-shot create)
 *
 * The /admin/forwarders list filter `?create=admin` picks exactly the rows
 * with non-empty adminidcreator + empty reforder, so the new row appears
 * under the "ฝากนำเข้า · admin" tab the moment it lands.
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql L1598
 * (tb_forwarder). The table has dozens of NOT NULL columns; this action
 * supplies the same blank/zero defaults the legacy PHP would (most of
 * them get re-stamped during status transitions or admin edits later).
 *
 * Status convention (matches Wave 11 STATUS_LABEL):
 *   '1' = รอเข้าโกดังจีน — the legacy initial state for a freshly-created row.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { uploadToBucket } from "@/lib/storage/upload";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same helper as wallet-hs.ts (third+ caller;
// extracting to actions/admin/common.ts is a separate refactor task).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data } = await admin
    .from("tb_admin")
    .select("adminid")
    .eq("adminemail", email)
    .maybeSingle<{ adminid: string | null }>();
  if (data?.adminid) return data.adminid;
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// Input schema — what the client form posts.
// ────────────────────────────────────────────────────────────

const WAREHOUSE_CHINA  = ["1", "2"] as const;             // 1=กวางโจว · 2=อี้อู
const TRANSPORT_TYPES  = ["1", "2", "3"] as const;        // 1=รถ · 2=เรือ · 3=แอร์

const createForwarderSchema = z.object({
  customerUserid:       z.string().trim().regex(/^PR\d+$/i, "userid ต้องเป็นรหัส PR####").max(20),
  warehouseChina:       z.enum(WAREHOUSE_CHINA),
  transportType:        z.enum(TRANSPORT_TYPES),
  trackingChn:          z.string().trim().min(1, "กรอกเลข tracking จีน").max(50),
  trackingTh:           z.string().trim().max(50).optional(),
  detail:               z.string().trim().min(1, "กรอกรายละเอียดสินค้า").max(2000),
  weight:               z.number().nonnegative("น้ำหนักต้องไม่ติดลบ"),
  volume:               z.number().nonnegative("ปริมาตรต้องไม่ติดลบ"),
  amount:               z.number().int().positive().max(10000).optional(),     // จำนวนกล่อง · default 1
  addressName:          z.string().trim().min(1, "กรอกชื่อผู้รับ").max(200),
  addressLastName:      z.string().trim().max(200).optional(),
  addressNo:            z.string().trim().min(1, "กรอกที่อยู่").max(255),
  addressSubdistrict:   z.string().trim().min(1, "กรอกตำบล/แขวง").max(255),
  addressDistrict:      z.string().trim().min(1, "กรอกอำเภอ/เขต").max(255),
  addressProvince:      z.string().trim().min(1, "กรอกจังหวัด").max(255),
  addressZipcode:       z.string().trim().regex(/^\d{5}$/, "รหัสไปรษณีย์ 5 หลัก").max(5),
  addressTel:           z.string().trim().min(1, "กรอกเบอร์ผู้รับ").max(10),
  addressNote:          z.string().trim().max(2000).optional(),
  crate:                z.enum(["1", "2"]).optional(),                          // 1=ตี · 2=ไม่ตี · default '2'
  note:                 z.string().trim().max(2000).optional(),                 // admin internal note
});
export type AdminCreateForwarderInput = z.infer<typeof createForwarderSchema>;

// ────────────────────────────────────────────────────────────
// adminCreateForwarder — INSERT tb_forwarder + (optional) cover upload.
//
// Flow:
//   1. Validate input.
//   2. Verify customer exists in tb_users.
//   3. (Optional) upload cover image to `forwarder-covers/cover/<ts>-<name>`
//      via lib/storage/upload.ts (Group A's helper).
//   4. INSERT tb_forwarder with adminidcreator = <calling admin's legacy id>
//      + safe defaults for every NOT NULL column the legacy doesn't
//      capture at create-time.
//   5. Audit log + revalidate paths.
//   6. Return new row id so the page can redirect to /admin/forwarders/<id>.
// ────────────────────────────────────────────────────────────

export async function adminCreateForwarder(
  rawInput: AdminCreateForwarderInput,
  coverFile?: File,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = createForwarderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ id: number }>(
    ["ops", "accounting", "super"],
    async ({ adminId }) => {
      const admin            = createAdminClient();
      const legacyAdminIdRaw = await resolveLegacyAdminId();
      // tb_forwarder.adminid* columns are varchar(10), but tb_admin.adminid
      // is varchar(20) and the email-fallback path is up to 30. Clip so an
      // operator with a longer adminid doesn't blow up the INSERT.
      const legacyAdminId    = legacyAdminIdRaw.slice(0, 10);

      // Verify the target customer exists in tb_users.
      const customerCode = d.customerUserid.toUpperCase();
      const { data: customer } = await admin
        .from("tb_users")
        .select("userid, username, userlastname")
        .eq("userid", customerCode)
        .maybeSingle<{
          userid: string;
          username: string | null;
          userlastname: string | null;
        }>();
      if (!customer) {
        return { ok: false, error: "ไม่พบสมาชิก (userid ไม่ตรงกับ tb_users)" };
      }

      // (Optional) upload cover. The admin uploads to a private bucket.
      // If Group A's `forwarder-covers` bucket doesn't exist yet on this
      // Supabase project, surface a clear error but DON'T fail the whole
      // create — the operator can submit again without an image. (We
      // actually do fail it for now; if a bucket is missing the safer
      // behaviour is to surface the infra error rather than write a row
      // that references a missing file.)
      let coverFilename = "";
      if (coverFile && coverFile instanceof File && coverFile.size > 0) {
        const upload = await uploadToBucket(coverFile, "forwarder-covers", "cover");
        if (!upload.ok) {
          return { ok: false, error: `อัปโหลดรูปสินค้าไม่สำเร็จ: ${upload.error}` };
        }
        coverFilename = upload.filename;
      }

      const nowIso = new Date().toISOString();

      // INSERT tb_forwarder. Every NOT NULL column the legacy zero-fills
      // at create-time is supplied here; status/price/dates get filled in
      // by later admin actions (status flips · combine-bill · driver assign).
      const { data: row, error: insErr } = await admin
        .from("tb_forwarder")
        .insert({
          fdate:                 nowIso,
          fstatus:               "1",                       // รอเข้าโกดังจีน — legacy initial state
          paydeposit:            "0",
          fwarehousechina:       d.warehouseChina,
          fwarehousename:        "1",                       // default = แสง (per Wave 11 WAREHOUSE_LABEL)
          ftransporttype:        d.transportType,
          fcabinetnumber:        "",                        // assigned at combine-bill
          ftrackingchn:          d.trackingChn,
          ftrackingth:           d.trackingTh && d.trackingTh.length > 0 ? d.trackingTh : "-",
          fshipby:               "",                        // shipping carrier — filled at เตรียมส่ง
          ffreeshipping:         "0",
          famount:               d.amount ?? 1,
          fdetail:               d.detail,
          fnote:                 d.note ?? null,
          fnoteuser:             "0",
          fnoteuserread:         "0",
          fcover:                coverFilename,             // empty string if no upload
          fphotoend:             "",
          fproductstype:         "1",                       // generic (admin can adjust later)
          fweight:               d.weight,
          fwidth:                0,
          flength:               0,
          fheight:               0,
          fvolume:               d.volume,
          customratekg:          0,
          customratecbm:         0,
          customrate:            "0",
          frefprice:             "0",
          frefrate:              0,
          fcostrefrate:          0,
          ftransportprice:       0,
          fpriceupdate:          0,
          fdiscount:             0,
          ftotalprice:           0,                         // filled by combine-bill / pricing
          fcosttotalprice:       0,
          fcosttotalpricesheet:  0,
          fprofittransportchn:   0,
          fprofitpriceupdate:    0,
          fprofittotal:          0,
          faddressname:          d.addressName,
          faddresslastname:      d.addressLastName ?? "",
          faddressno:            d.addressNo,
          faddresssubdistrict:   d.addressSubdistrict,
          faddressdistrict:      d.addressDistrict,
          faddressprovince:      d.addressProvince,
          faddresszipcode:       d.addressZipcode,
          faddressnote:          d.addressNote ?? "",
          faddresstel:           d.addressTel,
          faddresstel2:          "",
          faddresslatitude:      0,
          faddresslongitude:     0,
          userid:                customer.userid,            // canonical-case from tb_users
          adminid:               legacyAdminId,              // last toucher = creator at insert
          adminidcreator:        legacyAdminId,              // ← THE source badge
          adminidkey:            "",
          adminidupdate:         legacyAdminId,
          session:               "admin-manual",
          reforder:              "",                         // empty = not system-replicated
          fcredit:               "0",
          fusercompany:          "0",
          fsendsms1day:          "0",
          fsendsms3day:          "0",
          fsendsms3eday:         "0",
          paymethod:             "1",
          crate:                 d.crate ?? "2",            // default = ไม่ตี
          pricecrate:            0,
          fqc:                   "0",
          fqcprice:              0,
          ftransportpricechnthb: 0,
          pricemore:             "0",
          priceother:            0,
          linkapiorder:          "0",
          subuserid:             "",
          // The "fstatuscar*" columns govern truck-on/truck-off events.
          // At create-time they're all blank — the desk hasn't loaded the
          // parcel onto a truck yet.
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
        return { ok: false, error: insErr?.message ?? "insert failed" };
      }

      await logAdminAction(
        adminId,
        "forwarder.admin_create",
        "tb_forwarder",
        String(row.id),
        {
          userid:           customer.userid,
          warehouse_china:  d.warehouseChina,
          transport_type:   d.transportType,
          tracking_chn:     d.trackingChn,
          tracking_th:      d.trackingTh ?? null,
          cover_uploaded:   coverFilename ? true : false,
          weight_kg:        d.weight,
          volume_cbm:       d.volume,
          amount:           d.amount ?? 1,
        },
      );

      revalidatePath("/admin/forwarders");
      revalidatePath(`/admin/forwarders/${row.id}`);
      revalidatePath("/admin");
      return { ok: true, data: { id: row.id } };
    },
  );
}
