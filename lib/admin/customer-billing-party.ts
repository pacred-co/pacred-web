/**
 * `loadCustomerBillingParty` — THE one way to answer "who is this customer, on a
 * money document?" (ชื่อ · เลขที่ภาษี · ที่อยู่ · เบอร์ · อีเมล · นิติบุคคลไหม).
 *
 * 🔴 owner 2026-07-21 ("มันไม่มีข้อมูลวิ่งมาอะ"): the PayModal's ผู้รับใบแจ้งหนี้ block
 * rendered เลขที่ภาษี/ที่อยู่ as a hardcoded "—" — the fields were never wired to
 * anything, and `loadPanel` only ever carried userid/name/tel. Meanwhile the
 * printable ใบแจ้งหนี้ (pay-user/summary/page.tsx) DID resolve them, with ~90
 * lines of inline corp→address→fallback logic of its own.
 *
 * That is the exact drift `resolveBillingIdentity`'s own header warns about
 * ("the leaking surfaces … simply never ran it"). So rather than write a THIRD
 * copy, the resolution lives here once:
 *
 *   identity (ชื่อ/เลขภาษี/นิติบุคคล) → resolveBillingIdentity (the existing pure SOT)
 *   ที่อยู่                            → tb_corporate.corporateaddress
 *                                        ↳ else tb_address_main → tb_address (formatted)
 *   เบอร์ / อีเมล                      → tb_users.userTel / userEmail
 *
 * 💰 DISPLAY-ONLY. This resolves the TEXT a document shows for a party. It does
 * NOT decide any amount. ⚠️ `isJuristic` here is the resolveBillingIdentity UNION
 * (userCompany==='1' OR a corp tax-id) — callers that feed a MONEY switch
 * (computeBillWht / computeForwarderDebitBatch) must keep passing whichever flag
 * they passed before; `hasCorporateRow` is exposed separately precisely because
 * the pay-user panel's `is_corporate` means "a tb_corporate row exists" and that
 * narrower meaning must not silently widen.
 *
 * Soft-fails field-by-field: a corp/address read error logs and yields "" rather
 * than throwing — a missing address must never break a payment screen.
 */

import { resolveBillingIdentity, type CorporateIdentityRow } from "@/lib/admin/customer-identity";

/** Everything a money-doc header needs about one customer. */
export type CustomerBillingParty = {
  userid: string;
  /** Company name for นิติบุคคล, else the person's full name. Falls back to userid. */
  name: string;
  /** 13-digit corporate tax id; "" when none. */
  taxId: string;
  /** Registered company address, else the customer's main address; "" when none. */
  address: string;
  tel: string;
  email: string;
  /** resolveBillingIdentity UNION — display classification. */
  isJuristic: boolean;
  /** A tb_corporate row exists (the NARROWER signal — pay-user's `is_corporate`). */
  hasCorporateRow: boolean;
  /** Always the contact person's name (for a "ผู้ติดต่อ" sub-line under a company). */
  personName: string;
};

/** The tb_address columns used to compose a display address. */
type AddressRow = {
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
};

/**
 * Compose a one-line Thai display address. Verbatim the join the printable
 * ใบแจ้งหนี้ used inline (kept identical so the doc's address text never shifts).
 * Pure — exported for tests / callers that already hold the row.
 */
export function formatThaiAddressLine(addr: AddressRow | null | undefined): string {
  if (!addr) return "";
  return [
    addr.addressno ?? "",
    addr.addresssubdistrict ? `ตำบล/แขวง ${addr.addresssubdistrict}` : "",
    addr.addressdistrict ? `อำเภอ/เขต ${addr.addressdistrict}` : "",
    addr.addressprovince ? `จังหวัด ${addr.addressprovince}` : "",
    addr.addresszipcode ?? "",
  ]
    .filter((s) => s && String(s).trim().length > 0)
    .join(" ")
    .trim();
}

/**
 * Load one customer's billing party.
 *
 * `admin` is the service-role client. Typed loosely as `{ from(table): any }` for
 * the same reason `fetchCorporateNameMap` is — passing the fully-generic Supabase
 * client into a precise structural type trips TS2589 at call sites.
 */
export async function loadCustomerBillingParty(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (table: string) => any },
  userid: string,
): Promise<CustomerBillingParty | null> {
  const code = (userid ?? "").trim();
  if (!code) return null;

  const uRes = (await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userCompany, userTel, userEmail")
    .eq("userID", code)
    .maybeSingle()) as {
    data: {
      userID: string;
      userName: string | null;
      userLastName: string | null;
      userCompany: string | number | null;
      userTel: string | null;
      userEmail: string | null;
    } | null;
    error: { code?: string; message?: string } | null;
  };
  if (uRes.error) {
    console.error("[loadCustomerBillingParty tb_users] failed", {
      code: uRes.error.code, message: uRes.error.message, userid: code,
    });
    return null;
  }
  const u = uRes.data;
  if (!u) return null;

  // ── tb_corporate (นิติบุคคล) — soft-fail to "no corp row" ──
  const cRes = (await admin
    .from("tb_corporate")
    .select("corporatename, corporatenumber, corporateaddress")
    .eq("userid", code)
    .limit(1)
    .maybeSingle()) as {
    data: CorporateIdentityRow | null;
    error: { code?: string; message?: string } | null;
  };
  if (cRes.error && cRes.error.code !== "PGRST116") {
    console.error("[loadCustomerBillingParty tb_corporate] failed", {
      code: cRes.error.code, message: cRes.error.message, userid: code,
    });
  }
  const corp = cRes.data ?? null;

  const identity = resolveBillingIdentity({
    userCompany: u.userCompany != null ? String(u.userCompany) : null,
    userName: u.userName,
    userLastName: u.userLastName,
    corp,
  });

  // ── ที่อยู่: registered company address wins; else the customer's main address ──
  let address = identity.registeredAddress;
  if (!address) {
    const amRes = (await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", code)
      .maybeSingle()) as {
      data: { addressid: number | null } | null;
      error: { code?: string; message?: string } | null;
    };
    if (amRes.error && amRes.error.code !== "PGRST116") {
      console.error("[loadCustomerBillingParty tb_address_main] failed", {
        code: amRes.error.code, message: amRes.error.message, userid: code,
      });
    }
    if (amRes.data?.addressid) {
      const aRes = (await admin
        .from("tb_address")
        .select("addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
        .eq("addressid", amRes.data.addressid)
        .maybeSingle()) as {
        data: AddressRow | null;
        error: { code?: string; message?: string } | null;
      };
      if (aRes.error && aRes.error.code !== "PGRST116") {
        console.error("[loadCustomerBillingParty tb_address] failed", {
          code: aRes.error.code, message: aRes.error.message, userid: code,
        });
      }
      address = formatThaiAddressLine(aRes.data);
    }
  }

  return {
    userid: u.userID,
    name: identity.name || u.userID,
    taxId: identity.taxId,
    address,
    tel: (u.userTel ?? "").trim(),
    email: (u.userEmail ?? "").trim(),
    isJuristic: identity.isJuristic,
    hasCorporateRow: corp != null,
    personName: identity.personName,
  };
}
