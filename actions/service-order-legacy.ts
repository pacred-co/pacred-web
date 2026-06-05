"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { ADDRESSES } from "@/components/seo/site";

/**
 * Legacy `tb_header_order` writers for the CUSTOMER shop-order detail page —
 * D1 / ADR-0017 faithful 1:1 ports of the two self-service POST branches in
 * `member/shops.php` ($_GET['page']=='detail'):
 *
 *   - `update_hShipBy`  (shops.php L1470-1510)
 *       → UPDATE tb_header_order SET hShipBy=…, payMethod=…
 *         (+ the PCS-pickup address override, exactly like the forwarder twin)
 *   - `update_hAddress` (shops.php L1512-1551)
 *       → UPDATE tb_header_order SET hAddress*=… copied from the picked
 *         tb_address row; REFUSED when hShipBy='PCS' (legacy `eAddress`).
 *
 * These are the shop-order MIRROR of `actions/forwarder-legacy.ts`
 * (`updateLegacyForwarderShipBy` / `updateLegacyForwarderAddress`). The only
 * structural differences: the shop order is keyed by `hno` (string) + `userid`
 * (not the forwarder integer `id`), and the columns live on `tb_header_order`
 * (all lowercase — NOT in the camelCase batch).
 *
 * Edit gate (shops.php L1679 / L1701): the legacy detail page renders BOTH
 * inline edit forms `if($row_main['hStatus']!=5)` — i.e. the customer may change
 * carrier + delivery address until the order is สำเร็จ ('5'; legacy then tells
 * them to manage it in the import/forwarder flow). We additionally lock '6'
 * (ยกเลิก / cancelled — terminal, no active fulfilment) since the Pacred detail
 * page treats a cancelled order as read-only. Both actions re-check this gate
 * server-side (legacy's POST handler had no gate; the form was the only entry —
 * we harden it so a stale form can't replay against a completed order).
 *
 * Why a NEW file (not actions/service-order.ts): service-order.ts owns the
 * order list / detail / place / cancel / pay-from-wallet flows. These two are
 * the small inline-edit POST handlers — kept together + alongside the forwarder
 * twin's shape so the cargo-edit lane stays unambiguous.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** hStatus values where the customer may no longer change carrier/address. */
function isShippingLocked(hstatus: string | null): boolean {
  const s = (hstatus ?? "").trim();
  return s === "5" || s === "6"; // 5 = สำเร็จ (legacy lock) · 6 = ยกเลิก (terminal)
}

// ────────────────────────────────────────────────────────────
// UPDATE hShipBy — `update_hShipBy` POST (shops.php L1470-1510)
// ────────────────────────────────────────────────────────────

const updateShipBySchema = z.object({
  hNo:     z.string().trim().min(1).max(50),
  hShipBy: z.string().trim().min(1).max(10),
});
export type UpdateShopOrderShipByInput = z.infer<typeof updateShipBySchema>;

export async function updateLegacyShopOrderShipBy(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = updateShipBySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { hNo, hShipBy } = parsed.data;

  const session = await getCurrentUserWithProfile();
  if (!session?.profile) return { ok: false, error: "not_signed_in" };
  const userID = session.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // shops.php L1474-1477 — load the order (ownership-gated) for the status
  // gate + the current payMethod. maybeSingle so a wrong hNo → not_found.
  const { data: header, error: headerErr } = await admin
    .from("tb_header_order")
    .select("hstatus")
    .eq("hno", hNo)
    .eq("userid", userID)
    .maybeSingle<{ hstatus: string | null }>();
  if (headerErr) {
    console.error(`[service-order-legacy updateLegacyShopOrderShipBy lookup] failed`, { code: headerErr.code, message: headerErr.message });
    return { ok: false, error: headerErr.message };
  }
  if (!header) return { ok: false, error: "order_not_found" };
  if (isShippingLocked(header.hstatus)) {
    // Legacy shows: "กรุณาเปลี่ยนบริษัทขนส่งอีกครั้งในระบบฝากนำเข้า" (L1687).
    return { ok: false, error: "shipping_locked — ออเดอร์นี้สำเร็จ/ยกเลิกแล้ว ไม่สามารถเปลี่ยนบริษัทขนส่งได้" };
  }

  // shops.php L1480-1482 — in-origin carriers force payMethod='1' (เก็บต้นทาง).
  const inOrigin = hShipBy === "PCS" || hShipBy === "PCSF" || hShipBy === "PCSE"
    || hShipBy === "24" || hShipBy === "2";

  // shops.php L1483 — UPDATE hShipBy [+ payMethod], ownership-scoped.
  const baseUpdate: Record<string, string> = { hshipby: hShipBy };
  if (inOrigin) baseUpdate.paymethod = "1";

  const { error: updErr } = await admin
    .from("tb_header_order")
    .update(baseUpdate)
    .eq("hno", hNo)
    .eq("userid", userID);
  if (updErr) {
    console.error(`[service-order-legacy updateLegacyShopOrderShipBy update] failed`, { code: updErr.code, message: updErr.message });
    return { ok: false, error: updErr.message };
  }

  // shops.php L1489-1504 — self-pickup ('PCS') rewrites the delivery address to
  // the warehouse. Legacy hard-coded the old Bangkok PCS depot; under D1 self-
  // pickup uses Pacred's TH receiving warehouse (สมุทรสาคร — ADDRESSES.warehouseTh,
  // the same depot the forwarder PCS branch + the cart path write). haddresstel
  // is varchar(10) → digits-only Pacred company line "0224213325".
  if (hShipBy === "PCS") {
    const { error: addrErr } = await admin
      .from("tb_header_order")
      .update({
        haddressname:        "รับที่โกดัง Pacred",
        haddresslastname:    "",
        haddressno:          ADDRESSES.warehouseTh.line,
        haddresssubdistrict: ADDRESSES.warehouseTh.subDistrict,
        haddressdistrict:    ADDRESSES.warehouseTh.district,
        haddressprovince:    ADDRESSES.warehouseTh.province,
        haddresszipcode:     ADDRESSES.warehouseTh.postcode,
        haddressnote:        "",
        haddresstel:         "0224213325",
        haddresstel2:        "",
      })
      .eq("hno", hNo)
      .eq("userid", userID);
    if (addrErr) {
      console.error(`[service-order-legacy updateLegacyShopOrderShipBy pcs-address] failed`, { code: addrErr.code, message: addrErr.message });
      return { ok: false, error: addrErr.message };
    }
  }

  revalidatePath(`/service-order/${hNo}`);
  revalidatePath("/service-order");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// UPDATE hAddress — `update_hAddress` POST (shops.php L1512-1551)
// ────────────────────────────────────────────────────────────

const updateAddressSchema = z.object({
  hNo:       z.string().trim().min(1).max(50),
  addressID: z.string().trim().min(1).max(50),
});
export type UpdateShopOrderAddressInput = z.infer<typeof updateAddressSchema>;

export async function updateLegacyShopOrderAddress(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<ActionResult> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = updateAddressSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { hNo, addressID } = parsed.data;

  const session = await getCurrentUserWithProfile();
  if (!session?.profile) return { ok: false, error: "not_signed_in" };
  const userID = session.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // shops.php L1515-1520 — read current hStatus + hShipBy (PCS pickup blocks
  // the address change). Ownership-gated by userid.
  const { data: header, error: headerErr } = await admin
    .from("tb_header_order")
    .select("hstatus, hshipby")
    .eq("hno", hNo)
    .eq("userid", userID)
    .maybeSingle<{ hstatus: string | null; hshipby: string | null }>();
  if (headerErr) {
    console.error(`[service-order-legacy updateLegacyShopOrderAddress lookup] failed`, { code: headerErr.code, message: headerErr.message });
    return { ok: false, error: headerErr.message };
  }
  if (!header) return { ok: false, error: "order_not_found" };
  if (isShippingLocked(header.hstatus)) {
    return { ok: false, error: "shipping_locked — ออเดอร์นี้สำเร็จ/ยกเลิกแล้ว ไม่สามารถเปลี่ยนที่อยู่ได้" };
  }
  if ((header.hshipby ?? "").trim() === "PCS") {
    // Legacy `sweetalert='eAddress'` (L1546) — warehouse pickup, address locked.
    return { ok: false, error: "address_locked_pcs — รับเองที่โกดัง ไม่สามารถเปลี่ยนที่อยู่ได้" };
  }

  // shops.php L1521-1536 — SELECT the picked address (userid-scoped + active).
  const { data: addr, error: addrErr } = await admin
    .from("tb_address")
    .select("addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote")
    .eq("addressid", addressID)
    .eq("addressstatus", "1")
    .eq("userid", userID)
    .maybeSingle<{
      addressname: string | null;
      addresslastname: string | null;
      addresstel: string | null;
      addresstel2: string | null;
      addressno: string | null;
      addresssubdistrict: string | null;
      addressdistrict: string | null;
      addressprovince: string | null;
      addresszipcode: string | null;
      addressnote: string | null;
    }>();
  if (addrErr) {
    console.error(`[service-order-legacy updateLegacyShopOrderAddress address lookup] failed`, { code: addrErr.code, message: addrErr.message });
    return { ok: false, error: addrErr.message };
  }
  if (!addr) {
    // legacy `sweetalert='eSQL'` (L1543) — address not found / not owned.
    return { ok: false, error: "address_not_found — ไม่พบที่อยู่ในการจัดส่ง" };
  }

  // shops.php L1537-1540 — copy the address snapshot onto the order.
  const { error: updErr } = await admin
    .from("tb_header_order")
    .update({
      haddressname:        addr.addressname        ?? "",
      haddresslastname:    addr.addresslastname    ?? "",
      haddressno:          addr.addressno          ?? "",
      haddresssubdistrict: addr.addresssubdistrict ?? "",
      haddressdistrict:    addr.addressdistrict    ?? "",
      haddressprovince:    addr.addressprovince    ?? "",
      haddresszipcode:     addr.addresszipcode     ?? "",
      haddressnote:        addr.addressnote        ?? "",
      haddresstel:         addr.addresstel         ?? "",
      haddresstel2:        addr.addresstel2        ?? "",
    })
    .eq("hno", hNo)
    .eq("userid", userID);
  if (updErr) {
    console.error(`[service-order-legacy updateLegacyShopOrderAddress update] failed`, { code: updErr.code, message: updErr.message });
    return { ok: false, error: updErr.message };
  }

  revalidatePath(`/service-order/${hNo}`);
  revalidatePath("/service-order");
  return { ok: true };
}
