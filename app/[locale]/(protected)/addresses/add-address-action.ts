"use server";

/**
 * Server Action for the `address.php` add-address form. Field mapping and UI
 * behaviour remain the faithful PCS port; the persistence step is intentionally
 * hardened to save-or-reuse + atomically-safe default selection (ADR-0270).
 *
 * Transcribed verbatim from `member/address.php` lines 5-77 — the
 * `if( isset($_POST["add"]) )` branch:
 *
 *   1. Required-field check (addressName / addressLastname / addressTel /
 *      addressNo / district / amphoe / province / zipcode). On a missing
 *      field the legacy echoes `alert("กรุณากรอกข้อมูลให้ครบ")`.
 *   2. Save/reuse tb_address (addressName, addressLastname, addressTel,
 *      addressTel2, addressNo, addressSubDistrict, addressDistrict,
 *      addressProvince, addressZIPCode, addressNote, latitude, longitude,
 *      userID).
 *   3. Use the addressid returned by that write (never SELECT-latest).
 *   4. If the customer has no valid main address, select this address and align
 *      tb_users.userAddressID for the next checkout.
 *
 * The legacy POSTs back to `address.php` itself and on success shows a
 * SweetAlert ("เพิ่มข้อมูลสำเร็จ"); on failure `errorSave`. Here the
 * action redirects back to /addresses (success) — the SweetAlert popup
 * is jQuery and is not reproduced.
 *
 * `tb_*` is RLS-locked to service_role, so writes go through the admin
 * client; the join key is `tb_address.userid === profile.member_code`
 * (the customer's "PR<n>" code). The legacy `mysqli_real_escape_string`
 * is unnecessary — the Supabase client parameterises every value.
 *
 * NOTE — schema parity remains: `tb_address` carries NO
 * created_at / updated_at columns, so none are written. The migrated
 * `tb_address` row shape is exactly the legacy MySQL shape.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveCustomerAddress, setCustomerMainAddress } from "@/lib/admin/customer-address-book";

export async function addAddressAction(formData: FormData): Promise<void> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const userID = data.profile.member_code ?? "";

  // address.php L17-28 — read the POST fields.
  const addressName        = String(formData.get("addressName") ?? "").trim();
  const addressLastname    = String(formData.get("addressLastname") ?? "").trim();
  const addressTel         = String(formData.get("addressTel") ?? "").trim();
  const addressTel2        = String(formData.get("addressTel2") ?? "").trim();
  const addressNo          = String(formData.get("addressNo") ?? "").trim();
  const addressSubDistrict = String(formData.get("district") ?? "").trim();
  const addressDistrict    = String(formData.get("amphoe") ?? "").trim();
  const addressProvince    = String(formData.get("province") ?? "").trim();
  const addressZIPCode     = String(formData.get("zipcode") ?? "").trim();
  const addressNote        = String(formData.get("addressNote") ?? "").trim();
  const latitudeRaw        = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw       = String(formData.get("longitude") ?? "").trim();

  // address.php L6-14 — required-field guard (addressTel2 + addressNote
  // are optional; latitude/longitude come from the map pin).
  if (
    !addressName ||
    !addressLastname ||
    !addressTel ||
    !addressNo ||
    !addressSubDistrict ||
    !addressDistrict ||
    !addressProvince ||
    !addressZIPCode
  ) {
    // Legacy: echo '<script>alert("กรุณากรอกข้อมูลให้ครบ")</script>'.
    redirect("/addresses?error=incomplete");
  }

  const admin = createAdminClient();

  // Save-or-reuse and make the first address the default in the same flow.
  // This removes the legacy INSERT → SELECT latest race where two concurrent
  // submissions could attach the wrong addressid as the customer's main row.
  const saved = await saveCustomerAddress(admin, {
    userid: userID,
    address: {
      addressname: addressName,
      addresslastname: addressLastname,
      addresstel: addressTel,
      addresstel2: addressTel2,
      addressno: addressNo,
      addresssubdistrict: addressSubDistrict,
      addressdistrict: addressDistrict,
      addressprovince: addressProvince,
      addresszipcode: addressZIPCode,
      addressnote: addressNote,
    },
    adminid: "",
    forceDefault: false,
    latitude: latitudeRaw === "" ? 0 : Number(latitudeRaw),
    longitude: longitudeRaw === "" ? 0 : Number(longitudeRaw),
  });
  if (saved.error || !saved.data) {
    console.error(`[addAddressAction save] failed`, { userID, message: saved.error });
    redirect("/addresses?error=save");
  }

  // Legacy: $sweetalert = 'successSave' then re-renders the page.
  revalidatePath("/addresses");
  redirect("/addresses?saved=1");
}

/**
 * Server Action for the `address.php` edit-address form — the faithful
 * counterpart to addAddressAction above (D1 / ADR-0017 · faithful-port
 * workstream).
 *
 * Legacy address.php opened an edit modal (`editAddress.php` AJAX) that
 * UPDATEs an existing tb_address row by its addressID. This mirrors
 * addAddressAction field-for-field (SAME formData keys · SAME required-field
 * guard · SAME lat/long mapping · SAME column-name conventions) but issues an
 * UPDATE instead of an INSERT, and reads an extra hidden `addressId` to target
 * the row.
 *
 * SECURITY — the UPDATE is scoped `.eq("addressid", addressId).eq("userid",
 * userID)`: the `userid` predicate is REQUIRED so a customer can never edit
 * another customer's address by POSTing a foreign addressId (the admin client
 * bypasses RLS, so this WHERE clause is the only ownership check).
 *
 * addressstatus / userid / adminid are NOT written — they are preserved as-is
 * (this action only touches the editable address fields, like the legacy edit
 * modal). tb_address_main is untouched (editing an address does not change
 * which one is the main address).
 */
export async function editAddressAction(formData: FormData): Promise<void> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const userID = data.profile.member_code ?? "";

  // The hidden row id the edit modal targets (editAddress.php $addressID).
  const addressId = Number(formData.get("addressId") ?? "");

  // address.php L17-28 — read the POST fields (same keys as addAddressAction).
  const addressName        = String(formData.get("addressName") ?? "").trim();
  const addressLastname    = String(formData.get("addressLastname") ?? "").trim();
  const addressTel         = String(formData.get("addressTel") ?? "").trim();
  const addressTel2        = String(formData.get("addressTel2") ?? "").trim();
  const addressNo          = String(formData.get("addressNo") ?? "").trim();
  const addressSubDistrict = String(formData.get("district") ?? "").trim();
  const addressDistrict    = String(formData.get("amphoe") ?? "").trim();
  const addressProvince    = String(formData.get("province") ?? "").trim();
  const addressZIPCode     = String(formData.get("zipcode") ?? "").trim();
  const addressNote        = String(formData.get("addressNote") ?? "").trim();
  const latitudeRaw        = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw       = String(formData.get("longitude") ?? "").trim();

  // address.php L6-14 — required-field guard (addressTel2 + addressNote
  // are optional; latitude/longitude come from the map pin).
  if (
    !addressName ||
    !addressLastname ||
    !addressTel ||
    !addressNo ||
    !addressSubDistrict ||
    !addressDistrict ||
    !addressProvince ||
    !addressZIPCode
  ) {
    // Legacy: echo '<script>alert("กรุณากรอกข้อมูลให้ครบ")</script>'.
    redirect("/addresses?error=incomplete");
  }

  // Guard the row id — a non-positive / NaN addressId can never own a row.
  if (!Number.isFinite(addressId) || addressId <= 0) {
    redirect("/addresses?error=save");
  }

  const admin = createAdminClient();

  // editAddress.php — UPDATE tb_address SET … WHERE addressID=… AND userID=…
  // The userID predicate is the ownership guard (see header comment).
  // addressstatus / userid / adminid are intentionally NOT in the SET — they
  // are preserved.
  const { error: updateError } = await admin
    .from("tb_address")
    .update({
      addressname:        addressName,
      addresslastname:    addressLastname,
      addresstel:         addressTel,
      addresstel2:        addressTel2,
      addressno:          addressNo,
      addresssubdistrict: addressSubDistrict,
      addressdistrict:    addressDistrict,
      addressprovince:    addressProvince,
      addresszipcode:     addressZIPCode,
      addressnote:        addressNote,
      latitude:           latitudeRaw === "" ? 0 : Number(latitudeRaw),
      longitude:          longitudeRaw === "" ? 0 : Number(longitudeRaw),
    })
    .eq("addressid", addressId)
    .eq("userid", userID);

  if (updateError) {
    // Legacy: $sweetalert = 'errorSave'.
    console.error(`[tb_address update] failed`, {
      code: updateError.code,
      message: updateError.message,
    });
    redirect("/addresses?error=save");
  }

  // Legacy: $sweetalert = 'successSave' then re-renders the page.
  revalidatePath("/addresses");
  redirect("/addresses?saved=1");
}

/**
 * Server Action — SOFT-DELETE an address (legacy address.php delete branch).
 * 2026-06-01 Wave-A / M-1: the address-book delete button was inert
 * (`data-legacy-onclick`, no action) → customers couldn't remove a wrong
 * address (wrong-parcel risk). This is the faithful delete handler.
 *
 * FAITHFUL SOFT-DELETE — legacy hides addresses via `addressstatus` ('1'=active,
 * '0'=deleted); the /addresses read filters `.eq("addressstatus","1")`. So we
 * set addressstatus='0' (NOT a hard DELETE) — hides it from the list while
 * preserving the row for any order/FK references that point at this addressid.
 *
 * SECURITY — scoped `.eq("addressid", addressId).eq("userid", userID)`; the
 * userid predicate is the ownership guard (the admin client bypasses RLS, so
 * this WHERE is the only check — a customer can never delete a foreign row).
 * If the deleted row was the customer's main address, its tb_address_main
 * pointer is removed so a hidden address isn't shown as main (they re-pick via
 * setMainAddressAction).
 *
 * Wired by the /addresses UI as `<form action={deleteAddressAction}>` with a
 * hidden `addressId` (same convention as editAddressAction).
 */
export async function deleteAddressAction(formData: FormData): Promise<void> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const userID = data.profile.member_code ?? "";

  const addressId = Number(formData.get("addressId") ?? "");
  if (!Number.isFinite(addressId) || addressId <= 0) {
    redirect("/addresses?error=save");
  }

  const admin = createAdminClient();

  // Legacy parity (deleteAddress.php) — REFUSE deleting the MAIN address; the
  // customer must set another address as main first (else they'd be left with
  // no delivery address — Pacred previously allowed it + dropped the pointer).
  const { data: mainRow, error: mainErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", userID)
    .eq("addressid", addressId)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle<{ addressid: number }>();
  if (mainErr) {
    console.error(`[tb_address_main main-check] failed`, { code: mainErr.code, message: mainErr.message });
    redirect("/addresses?error=save");
  }
  if (mainRow && Number(mainRow.addressid) === addressId) {
    redirect("/addresses?error=delete_main");
  }

  // Soft-delete: addressstatus '1' → '0' (the list reads only '1').
  const { error: delError } = await admin
    .from("tb_address")
    .update({ addressstatus: "0" })
    .eq("addressid", addressId)
    .eq("userid", userID);
  if (delError) {
    console.error(`[tb_address soft-delete] failed`, { code: delError.code, message: delError.message });
    redirect("/addresses?error=save");
  }

  // Drop a dangling main-pointer if this was the main address.
  await admin
    .from("tb_address_main")
    .delete()
    .eq("userid", userID)
    .eq("addressid", addressId);

  revalidatePath("/addresses");
  redirect("/addresses?saved=1");
}

/**
 * Server Action — SET an address as the customer's main/default
 * (legacy "ตั้งเป็นที่อยู่หลัก"). 2026-06-01 Wave-A / M-1: the set-main button
 * was inert. tb_address_main holds ONE pointer row per user (userID → addressID).
 *
 * SECURITY — the target address must belong to the customer (verified against
 * tb_address by `userid`) before main is pointed at it; a foreign/missing
 * addressId is refused. Wired as `<form action={setMainAddressAction}>` with a
 * hidden `addressId`.
 */
export async function setMainAddressAction(formData: FormData): Promise<void> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const userID = data.profile.member_code ?? "";

  const addressId = Number(formData.get("addressId") ?? "");
  if (!Number.isFinite(addressId) || addressId <= 0) {
    redirect("/addresses?error=save");
  }

  const admin = createAdminClient();

  const selected = await setCustomerMainAddress(admin, userID, addressId);
  if (selected.error) {
    console.error(`[setMainAddressAction] failed`, { userID, addressId, message: selected.error });
    redirect("/addresses?error=save");
  }

  revalidatePath("/addresses");
  redirect("/addresses?saved=1");
}
