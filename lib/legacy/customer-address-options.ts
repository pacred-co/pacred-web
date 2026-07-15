import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provinceFromAddressText } from "@/lib/forwarder/carrier-province-coverage";

/**
 * Customer address-picker options for the inline "แก้ไข ที่อยู่จัดส่ง" forms.
 *
 * Faithful port of the legacy address <select> builder (shops.php L1704-1751 /
 * forwarder.php L976-997): the customer's active tb_address rows, MAIN address
 * first (tb_address ⋈ tb_address_main), then the rest by addressid asc, each
 * labelled `คุณ{name} {no} ตำบล/แขวง {sub} อำเภอ/เขต {district} จังหวัด {prov} {zip}`.
 *
 * Extracted here so both the shop-order detail page and the forwarder detail
 * page can share one implementation (the forwarder page still has its own inline
 * copy — it can adopt this later; per §12 the NEW shop page uses the shared one).
 *
 * Reads tb_* (RLS-locked → pass the admin client). Ownership is the memberCode
 * filter (a customer only ever sees their own PR<n> addresses). Soft-fails to an
 * empty list on any query error (mirrors the legacy "no rows" path).
 */
export type CustomerAddressOption = {
  addressid: number | string;
  label: string;
  isMain: boolean;
};

type AddrRow = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
};

export async function loadCustomerAddressOptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  memberCode: string,
): Promise<CustomerAddressOption[]> {
  if (!memberCode) return [];

  const { data: mainAddrRow, error: mainAddrErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | string | null }>();
  if (mainAddrErr) {
    console.error(`[customer-address-options tb_address_main] memberCode=${memberCode}`, { code: mainAddrErr.code, message: mainAddrErr.message });
  }
  const mainAddressId = mainAddrRow?.addressid ?? null;

  const { data: allAddrs, error: allAddrsErr } = await admin
    .from("tb_address")
    .select("addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  if (allAddrsErr) {
    console.error(`[customer-address-options tb_address] memberCode=${memberCode}`, { code: allAddrsErr.code, message: allAddrsErr.message });
    return [];
  }

  const addrList = ((allAddrs ?? []) as AddrRow[]).slice();

  // Sort: main first, then addressid asc (the legacy ORDER BY).
  let mainIdx = -1;
  for (let i = 0; i < addrList.length; i++) {
    if (mainAddressId != null && String(addrList[i].addressid) === String(mainAddressId)) {
      mainIdx = i;
      break;
    }
  }
  const sorted: AddrRow[] = [];
  if (mainIdx >= 0) sorted.push(addrList[mainIdx]);
  addrList
    .filter((_, i) => i !== mainIdx)
    .sort((a, b) => Number(a.addressid) - Number(b.addressid))
    .forEach((a) => sorted.push(a));

  return sorted.map((a) => {
    const parts = [
      a.addressname ?? "",
      a.addresslastname ?? "",
      a.addressno ?? "",
      "ตำบล/แขวง",
      a.addresssubdistrict ?? "",
      "อำเภอ/เขต",
      a.addressdistrict ?? "",
      "จังหวัด",
      a.addressprovince ?? "",
      a.addresszipcode ?? "",
    ].filter((s) => s !== "").join(" ");
    const isMain = mainAddressId != null && String(a.addressid) === String(mainAddressId);
    return {
      addressid: a.addressid,
      label: isMain ? `[ที่อยู่หลัก] ${parts}` : parts,
      isMain,
    };
  });
}

/**
 * The customer's FULL saved-address rows (structured fields), for the reusable
 * <CustomerAddressPicker> (forwarder detail + billing-run document). Returns
 * every active tb_address row with the readable detail fields + an `isDefault`
 * flag (tb_address_main), MAIN address first then addressid asc. Soft-fails to
 * an empty list. Shared so both surfaces load an identical shape.
 */
export type CustomerAddressRow = {
  addressID: number;
  name: string;
  lastname: string;
  addressno: string;
  subdistrict: string;
  district: string;
  province: string;
  zipcode: string;
  tel: string;
  tel2: string;
  note: string;
  isDefault: boolean;
};

export async function loadCustomerAddressRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  memberCode: string,
): Promise<CustomerAddressRow[]> {
  if (!memberCode) return [];

  const { data: mainRow, error: mainErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | string | null }>();
  if (mainErr) {
    console.error(`[customer-address-rows tb_address_main] memberCode=${memberCode}`, { code: mainErr.code, message: mainErr.message });
  }
  const mainId = mainRow?.addressid ?? null;

  const { data: rows, error } = await admin
    .from("tb_address")
    .select("addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2, addressnote")
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  if (error) {
    console.error(`[customer-address-rows tb_address] memberCode=${memberCode}`, { code: error.code, message: error.message });
    return [];
  }

  const list = (rows ?? []) as FullAddrRow[];

  // MAIN first, then addressid asc (matches loadCustomerAddressOptions sort).
  let mainIdx = -1;
  for (let i = 0; i < list.length; i++) {
    if (mainId != null && String(list[i].addressid) === String(mainId)) { mainIdx = i; break; }
  }
  const sorted: FullAddrRow[] = [];
  if (mainIdx >= 0) sorted.push(list[mainIdx]);
  list
    .filter((_, i) => i !== mainIdx)
    .sort((a, b) => Number(a.addressid) - Number(b.addressid))
    .forEach((a) => sorted.push(a));

  return sorted.map((a) => ({
    addressID:   Number(a.addressid),
    name:        a.addressname ?? "",
    lastname:    a.addresslastname ?? "",
    addressno:   a.addressno ?? "",
    subdistrict: a.addresssubdistrict ?? "",
    district:    a.addressdistrict ?? "",
    province:    a.addressprovince ?? "",
    zipcode:     a.addresszipcode ?? "",
    tel:         a.addresstel ?? "",
    tel2:        a.addresstel2 ?? "",
    note:        a.addressnote ?? "",
    isDefault:   mainId != null && String(a.addressid) === String(mainId),
  }));
}

/**
 * The customer's saved PRIMARY (ที่อยู่หลัก) delivery address, with the full
 * structured fields needed to render it (the option list above returns only a
 * concatenated label). MAIN address first (tb_address_main), else the lowest
 * active addressid. Soft-fails to null on any error / no address.
 *
 * Used by the forwarder detail page (ภูม 2026-06-18) — when a delivery carrier
 * (not 'PCS' self-pickup) has a stale warehouse-default faddress snapshot, the
 * page falls back to displaying this profile address instead.
 */
export type CustomerPrimaryAddress = {
  addressid: number | string;
  name: string;
  lastname: string;
  no: string;
  subdistrict: string;
  district: string;
  province: string;
  zipcode: string;
  tel: string;
  tel2: string;
  note: string;
};

type FullAddrRow = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
  addresstel: string | null;
  addresstel2: string | null;
  addressnote: string | null;
};

export async function loadCustomerPrimaryAddress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  memberCode: string,
): Promise<CustomerPrimaryAddress | null> {
  if (!memberCode) return null;

  const { data: mainRow, error: mainErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | string | null }>();
  if (mainErr) {
    console.error(`[customer-primary-address tb_address_main] memberCode=${memberCode}`, { code: mainErr.code, message: mainErr.message });
  }
  const mainId = mainRow?.addressid ?? null;

  const { data: rows, error } = await admin
    .from("tb_address")
    .select("addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2, addressnote")
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  if (error) {
    console.error(`[customer-primary-address tb_address] memberCode=${memberCode}`, { code: error.code, message: error.message });
    return null;
  }

  const list = (rows ?? []) as FullAddrRow[];
  if (list.length === 0) return null;

  // MAIN first; else the lowest active addressid (matches the option-list sort).
  let pick =
    mainId != null
      ? list.find((a) => String(a.addressid) === String(mainId))
      : undefined;
  if (!pick) pick = [...list].sort((a, b) => Number(a.addressid) - Number(b.addressid))[0];

  return {
    addressid:   pick.addressid,
    name:        pick.addressname ?? "",
    lastname:    pick.addresslastname ?? "",
    no:          pick.addressno ?? "",
    subdistrict: pick.addresssubdistrict ?? "",
    district:    pick.addressdistrict ?? "",
    province:    pick.addressprovince ?? "",
    zipcode:     pick.addresszipcode ?? "",
    tel:         pick.addresstel ?? "",
    tel2:        pick.addresstel2 ?? "",
    note:        pick.addressnote ?? "",
  };
}

/**
 * A นิติบุคคล (juristic) member's registered COMPANY address — a single free-form
 * string (`tb_corporate.corporateaddress`), NOT the structured tb_address fields.
 * Returned only when the address line is non-empty. Used as the LAST delivery
 * fallback (ภูม 2026-06-18): a juristic customer who never saved a tb_address row
 * still entered a company address at signup — show that instead of the warehouse.
 */
export type CustomerCorporateAddress = {
  name: string;
  addressLine: string;
  /** Best-effort canonical province parsed from the free-form `corporateaddress`
   *  ("" when none recognised). Feeds the delivery-province fallback so the
   *  carrier picker can show couriers for a juristic customer who never saved a
   *  structured tb_address. */
  province: string;
};

export async function loadJuristicCorporateAddress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  memberCode: string,
): Promise<CustomerCorporateAddress | null> {
  if (!memberCode) return null;
  const { data, error } = await admin
    .from("tb_corporate")
    .select("corporatename, corporateaddress")
    .eq("userid", memberCode)
    .maybeSingle<{ corporatename: string | null; corporateaddress: string | null }>();
  if (error) {
    console.error(`[customer-corporate-address tb_corporate] memberCode=${memberCode}`, { code: error.code, message: error.message });
    return null;
  }
  const addressLine = (data?.corporateaddress ?? "").trim();
  if (!addressLine) return null;
  return {
    name: (data?.corporatename ?? "").trim(),
    addressLine,
    // tb_corporate has no structured province column — parse it out of the blob.
    province: provinceFromAddressText(addressLine),
  };
}
