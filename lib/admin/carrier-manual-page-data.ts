/**
 * Shared server-side page-data loader for the 4 `/admin/api-sheets-*` pages.
 *
 * Wave 17 P1-3..6. Each page wraps <CarrierManualForm /> with the SAME
 * server-fetched payload (coidList · freeShipping flag · optional preset
 * user from ?q=PR1234). Centralising avoids 4× duplicated server code.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AddressOption,
  CustomerOption,
} from "@/actions/admin/forwarders-new";

export type CarrierManualSearchParams = { q?: string };

type CoidOption = { coid: string; coname: string };

export type CarrierManualPageData = {
  coidList:        CoidOption[];
  freeShipping:    boolean;
  presetUser:      CustomerOption | null;
  presetCoid:      string | null;
  presetAddresses: AddressOption[];
};

export async function loadCarrierManualPageData(
  sp: CarrierManualSearchParams,
): Promise<CarrierManualPageData> {
  const admin = createAdminClient();

  // ─── tb_co (member tiers) ────────────────────────────────────────
  const { data: coRaw, error: coRawErr } = await admin
    .from("tb_co")
    .select("coid, coname")
    .eq("costatus", "1")
    .order("coid", { ascending: true })
    .limit(100);
  if (coRawErr) {
    console.error(`[tb_co list] failed`, { code: coRawErr.code, message: coRawErr.message });
  }
  const coidList = (coRaw ?? []) as CoidOption[];

  // ─── tb_settings.freeShipping ───────────────────────────────────
  const { data: settingsRow, error: settingsRowErr } = await admin
    .from("tb_settings")
    .select("freeshipping")
    .eq("id", 1)
    .maybeSingle<{ freeshipping: string | null }>();
  if (settingsRowErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
  }
  const freeShipping = settingsRow?.freeshipping === "1";

  // ─── Optional preset (?q=PR1234) ────────────────────────────────
  let presetUser:      CustomerOption | null = null;
  let presetCoid:      string | null         = null;
  let presetAddresses: AddressOption[]       = [];

  const qRaw = (sp.q ?? "").trim();
  if (qRaw) {
    const candidate = qRaw.toUpperCase();
    const { data: userRow, error: userRowErr } = await admin
      .from("tb_users")
      .select("userid, username, userlastname, usertel, coid")
      .eq("userid", candidate)
      .maybeSingle<CustomerOption & { coid: string | null }>();
    if (userRowErr) {
      console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
    }

    if (userRow) {
      presetUser = {
        userid:       userRow.userid,
        username:     userRow.username,
        userlastname: userRow.userlastname,
        usertel:      userRow.usertel,
      };
      presetCoid = userRow.coid;

      const [{ data: addrRows }, { data: mainRow }] = await Promise.all([
        admin
          .from("tb_address")
          .select(
            "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2, addressnote",
          )
          .eq("userid", userRow.userid)
          .eq("addressstatus", "1")
          .order("addressid", { ascending: true })
          .limit(50),
        admin
          .from("tb_address_main")
          .select("addressid")
          .eq("userid", userRow.userid)
          .maybeSingle<{ addressid: number }>(),
      ]);

      const mainId = mainRow?.addressid ?? null;
      presetAddresses = ((addrRows ?? []) as Omit<AddressOption, "isMain">[]).map((r) => ({
        ...r,
        isMain: mainId !== null && r.addressid === mainId,
      }));
      presetAddresses.sort((a, b) => {
        if (a.isMain && !b.isMain) return -1;
        if (!a.isMain && b.isMain) return 1;
        return a.addressid - b.addressid;
      });
    }
  }

  return { coidList, freeShipping, presetUser, presetCoid, presetAddresses };
}
