"use server";

/**
 * Server Action for the `address.php` add-address form — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo POST handler (D1 / ADR-0017 ·
 * faithful-port workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * Transcribed verbatim from `member/address.php` lines 5-77 — the
 * `if( isset($_POST["add"]) )` branch:
 *
 *   1. Required-field check (addressName / addressLastname / addressTel /
 *      addressNo / district / amphoe / province / zipcode). On a missing
 *      field the legacy echoes `alert("กรุณากรอกข้อมูลให้ครบ")`.
 *   2. INSERT INTO tb_address (addressName, addressLastname, addressTel,
 *      addressTel2, addressNo, addressSubDistrict, addressDistrict,
 *      addressProvince, addressZIPCode, addressNote, latitude, longitude,
 *      userID).
 *   3. SELECT addressID FROM tb_address WHERE userID=… ORDER BY addressID
 *      DESC  — grab the just-inserted row id.
 *   4. SELECT ID FROM tb_address_main WHERE userID=…  — if the customer
 *      has NO main address yet, INSERT the new row as their main address.
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
 * NOTE — this matches the legacy faithfully: `tb_address` carries NO
 * created_at / updated_at columns, so none are written. The migrated
 * `tb_address` row shape is exactly the legacy MySQL shape.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // address.php L31-58 — INSERT INTO tb_address.
  const { error: insertError } = await admin.from("tb_address").insert({
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
    userid:             userID,
    // tb_address.adminid is varchar(30) NOT NULL with NO column default in the
    // migrated schema. A customer-added address has no admin, so write the
    // empty string — legacy MySQL stored '' for this case (PHP NULL → '' on
    // string interpolation · see docs/learnings/php-port-patterns.md). OMITTING
    // it → "null value in column adminid violates not-null constraint" → the
    // INSERT fails → redirect ?error=save → the new address never appears in
    // the list. This was THE bug ปอน hit 2026-05-30 ("กดเพิ่มแล้วข้อมูลไม่เข้า").
    adminid:            "",
  });

  if (insertError) {
    // Legacy: $sweetalert = 'errorSave'.
    redirect("/addresses?error=save");
  }

  // address.php L63-66 — SELECT the just-inserted addressID
  // (ORDER BY addressID DESC LIMIT 1).
  const { data: lastRow, error: lastRowErr } = await admin
    .from("tb_address")
    .select("addressid")
    .eq("userid", userID)
    .order("addressid", { ascending: false })
    .limit(1)
    .maybeSingle<{ addressid: number }>();
  if (lastRowErr) {
    console.error(`[tb_address list] failed`, { code: lastRowErr.code, message: lastRowErr.message });
  }

  // address.php L67-73 — if the customer has no main address, set this
  // new row as the main address.
  if (lastRow?.addressid != null) {
    const { data: mainRow, error: mainRowErr } = await admin
      .from("tb_address_main")
      .select("id")
      .eq("userid", userID)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (mainRowErr) {
      console.error(`[tb_address_main list] failed`, { code: mainRowErr.code, message: mainRowErr.message });
    }

    if (!mainRow) {
      await admin
        .from("tb_address_main")
        .insert({ addressid: lastRow.addressid, userid: userID });
    }
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
