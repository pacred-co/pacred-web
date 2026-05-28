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
