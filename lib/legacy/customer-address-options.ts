import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
