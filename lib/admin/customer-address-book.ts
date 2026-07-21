import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalProvince } from "@/lib/forwarder/carrier-province-coverage";

const compact = (value: string): string => value.normalize("NFKC").replace(/\s+/g, " ").trim();

const requiredText = (label: string, max: number) =>
  z.string().transform(compact).pipe(z.string().min(1, label).max(max));

const provinceSchema = z.string()
  .transform((value) => canonicalProvince(value))
  .pipe(z.string().min(1, "จังหวัดไม่ถูกต้อง"));

/** Canonical shape shared by every staff-entered customer delivery address. */
export const customerAddressSchema = z.object({
  addressname: requiredText("กรุณากรอกชื่อ", 200),
  addresslastname: requiredText("กรุณากรอกนามสกุล", 200),
  addresstel: z.string().transform(compact).pipe(z.string().regex(/^\d{9,10}$/, "เบอร์โทร 9-10 หลัก (ไม่มีขีด)")),
  addresstel2: z.string().transform(compact).pipe(z.string().regex(/^\d{9,10}$/, "เบอร์สำรอง 9-10 หลัก").or(z.literal(""))).default(""),
  addressno: requiredText("กรุณากรอกที่อยู่/บ้านเลขที่", 200),
  addresssubdistrict: requiredText("กรุณากรอกตำบล/แขวง", 255),
  addressdistrict: requiredText("กรุณากรอกอำเภอ/เขต", 255),
  addressprovince: provinceSchema,
  addresszipcode: z.string().transform(compact).pipe(z.string().regex(/^\d{5}$/, "รหัสไปรษณีย์ 5 หลัก")),
  addressnote: z.string().transform(compact).pipe(z.string().max(500)).default(""),
});

export type CustomerAddressInput = z.input<typeof customerAddressSchema>;
export type CustomerAddress = z.output<typeof customerAddressSchema>;

type AddressRow = CustomerAddress & { addressid: number };
type RawAddressRow = Partial<Record<keyof CustomerAddress, unknown>> & { addressid: number | string };
type MainRow = { id: number; addressid: number };

/** Validate a legacy DB row before it becomes an order/forwarder snapshot. */
export function parseCustomerAddressRow(
  row: unknown,
): { data: CustomerAddress | null; error: string | null } {
  if (row == null || typeof row !== "object") return { data: null, error: "ไม่พบข้อมูลที่อยู่" };
  const record = row as Record<string, unknown>;
  const parsed = customerAddressSchema.safeParse({
    ...record,
    addresstel2: record.addresstel2 ?? "",
    addressnote: record.addressnote ?? "",
  });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "ที่อยู่ไม่ครบถ้วน" };
  }
  return { data: parsed.data, error: null };
}

/**
 * A stable identity for one reusable delivery address. Optional note/phone-2 do
 * not create a duplicate; when the same core address is entered again those
 * two mutable details are refreshed on the existing row.
 */
export function customerAddressFingerprint(address: CustomerAddress): string {
  return JSON.stringify([
    address.addressname,
    address.addresslastname,
    address.addresstel,
    address.addressno,
    address.addresssubdistrict,
    address.addressdistrict,
    address.addressprovince,
    address.addresszipcode,
  ].map((value) => compact(value).toLocaleLowerCase("th-TH")));
}

export type MainAddressPlan = {
  keepRowId: number | null;
  targetAddressId: number;
  deleteRowIds: number[];
  isCandidateDefault: boolean;
};

/** Pure decision table used by the DB writer and regression tests. */
export function planMainAddress(
  mains: MainRow[],
  activeAddressIds: ReadonlySet<number>,
  candidateAddressId: number,
  forceDefault: boolean,
): MainAddressPlan {
  const ordered = [...mains].sort((a, b) => a.id - b.id);
  const valid = ordered.find((row) => activeAddressIds.has(Number(row.addressid))) ?? null;
  const keep = valid ?? ordered[0] ?? null;
  const targetAddressId = forceDefault || !valid
    ? candidateAddressId
    : Number(valid.addressid);
  return {
    keepRowId: keep?.id ?? null,
    targetAddressId,
    deleteRowIds: ordered.filter((row) => row.id !== keep?.id).map((row) => row.id),
    isCandidateDefault: targetAddressId === candidateAddressId,
  };
}

export type SaveCustomerAddressResult = {
  addressId: number;
  created: boolean;
  isDefault: boolean;
};

/**
 * Save-or-reuse one active address and repair the customer's default pointer.
 * `forceDefault` is used by the forwarder manual correction flow: the staff
 * explicitly confirms this is the address to use next time. Even before mig
 * 0270 is applied this consolidates duplicate pointers best-effort; 0270 adds
 * the database-level concurrency guarantee.
 */
export async function saveCustomerAddress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  args: {
    userid: string;
    address: CustomerAddressInput;
    adminid: string;
    forceDefault?: boolean;
    latitude?: number;
    longitude?: number;
  },
): Promise<{ data: SaveCustomerAddressResult | null; error: string | null }> {
  const userid = compact(args.userid).toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(userid)) return { data: null, error: "รหัสลูกค้าไม่ถูกต้อง" };
  const parsed = customerAddressSchema.safeParse(args.address);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "ที่อยู่ไม่ถูกต้อง" };
  const address = parsed.data;
  const latitude = Number.isFinite(args.latitude) && Math.abs(args.latitude ?? 0) <= 90 ? Number(args.latitude) : 0;
  const longitude = Number.isFinite(args.longitude) && Math.abs(args.longitude ?? 0) <= 180 ? Number(args.longitude) : 0;

  const { data: customer, error: customerErr } = await admin
    .from("tb_users")
    .select("userID")
    .eq("userID", userid)
    .maybeSingle<{ userID: string }>();
  if (customerErr) return { data: null, error: `ตรวจสอบลูกค้าไม่สำเร็จ: ${customerErr.message}` };
  if (!customer) return { data: null, error: "ไม่พบลูกค้าสำหรับบันทึกสมุดที่อยู่" };

  const { data: rows, error: rowsErr } = await admin
    .from("tb_address")
    .select("addressid, addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote")
    .eq("userid", userid)
    .eq("addressstatus", "1")
    .order("addressid", { ascending: true })
    .limit(1000);
  if (rowsErr) return { data: null, error: `อ่านสมุดที่อยู่ไม่สำเร็จ: ${rowsErr.message}` };

  const activeRows: AddressRow[] = [];
  for (const row of (rows ?? []) as RawAddressRow[]) {
    const usable = parseCustomerAddressRow(row);
    if (usable.data) activeRows.push({ ...usable.data, addressid: Number(row.addressid) });
  }
  const fingerprint = customerAddressFingerprint(address);
  const existing = activeRows.find((row) => customerAddressFingerprint(row) === fingerprint);

  let addressId: number;
  let created = false;
  if (existing) {
    addressId = Number(existing.addressid);
    if (
      existing.addresstel2 !== address.addresstel2
      || existing.addressnote !== address.addressnote
      || latitude !== 0
      || longitude !== 0
    ) {
      const { error } = await admin
        .from("tb_address")
        .update({
          addresstel2: address.addresstel2,
          addressnote: address.addressnote,
          ...(latitude !== 0 ? { latitude } : {}),
          ...(longitude !== 0 ? { longitude } : {}),
        })
        .eq("addressid", addressId)
        .eq("userid", userid)
        .eq("addressstatus", "1");
      if (error) return { data: null, error: `อัปเดตสมุดที่อยู่ไม่สำเร็จ: ${error.message}` };
    }
  } else {
    const { data: inserted, error } = await admin
      .from("tb_address")
      .insert({
        ...address,
        addressstatus: "1",
        latitude,
        longitude,
        userid,
        adminid: compact(args.adminid).slice(0, 30),
      })
      .select("addressid")
      .single<{ addressid: number }>();
    if (error || !inserted) return { data: null, error: `บันทึกสมุดที่อยู่ไม่สำเร็จ: ${error?.message ?? "unknown"}` };
    addressId = Number(inserted.addressid);
    created = true;
    activeRows.push({ ...address, addressid: addressId });
  }

  const { data: mainRows, error: mainErr } = await admin
    .from("tb_address_main")
    .select("id, addressid")
    .eq("userid", userid)
    .order("id", { ascending: true })
    .limit(1000);
  if (mainErr) return { data: null, error: `อ่านที่อยู่หลักไม่สำเร็จ: ${mainErr.message}` };

  const plan = planMainAddress(
    (mainRows ?? []) as MainRow[],
    new Set(activeRows.map((row) => Number(row.addressid))),
    addressId,
    args.forceDefault === true,
  );

  if (plan.keepRowId == null) {
    const { error } = await admin.from("tb_address_main").insert({ userid, addressid: plan.targetAddressId });
    if (error) {
      // Migration 0270 makes userid unique. A concurrent first-address insert
      // can win between the read and INSERT; converge on our confirmed target.
      if (error.code !== "23505") return { data: null, error: `ตั้งที่อยู่หลักไม่สำเร็จ: ${error.message}` };
      const { error: retryErr } = await admin
        .from("tb_address_main")
        .update({ addressid: plan.targetAddressId })
        .eq("userid", userid);
      if (retryErr) return { data: null, error: `ตั้งที่อยู่หลักไม่สำเร็จ: ${retryErr.message}` };
    }
  } else {
    const { error } = await admin
      .from("tb_address_main")
      .update({ addressid: plan.targetAddressId })
      .eq("id", plan.keepRowId)
      .eq("userid", userid);
    if (error) return { data: null, error: `ตั้งที่อยู่หลักไม่สำเร็จ: ${error.message}` };
  }

  if (plan.deleteRowIds.length > 0) {
    const { error } = await admin.from("tb_address_main").delete().in("id", plan.deleteRowIds).eq("userid", userid);
    if (error) return { data: null, error: `ล้างที่อยู่หลักซ้ำไม่สำเร็จ: ${error.message}` };
  }

  if (plan.isCandidateDefault) {
    const { error } = await admin
      .from("tb_users")
      .update({ userAddressID: String(addressId) })
      .eq("userID", userid);
    if (error) return { data: null, error: `บันทึกที่อยู่สำหรับครั้งถัดไปไม่สำเร็จ: ${error.message}` };
  }

  return { data: { addressId, created, isDefault: plan.isCandidateDefault }, error: null };
}

/**
 * Deliberately select one existing active/owned address as the customer's one
 * default. This is shared by member and admin profile actions so both also
 * repair pre-0270 duplicate pointers and align the next-checkout selection.
 */
export async function setCustomerMainAddress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  rawUserid: string,
  addressId: number,
): Promise<{ error: string | null }> {
  const userid = compact(rawUserid).toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(userid) || !Number.isInteger(addressId) || addressId <= 0) {
    return { error: "ที่อยู่ไม่ถูกต้อง" };
  }

  const { data: owned, error: ownedErr } = await admin
    .from("tb_address")
    .select("addressid")
    .eq("addressid", addressId)
    .eq("userid", userid)
    .eq("addressstatus", "1")
    .maybeSingle<{ addressid: number }>();
  if (ownedErr) return { error: `ตรวจสอบที่อยู่ไม่สำเร็จ: ${ownedErr.message}` };
  if (!owned) return { error: "ไม่พบที่อยู่ที่ยังใช้งานของลูกค้ารายนี้" };

  const { data: mainRows, error: mainErr } = await admin
    .from("tb_address_main")
    .select("id, addressid")
    .eq("userid", userid)
    .order("id", { ascending: true })
    .limit(1000);
  if (mainErr) return { error: `อ่านที่อยู่หลักไม่สำเร็จ: ${mainErr.message}` };

  const ordered = ((mainRows ?? []) as MainRow[]).sort((a, b) => a.id - b.id);
  const keep = ordered.find((row) => Number(row.addressid) === addressId) ?? ordered[0] ?? null;
  if (keep) {
    const { error } = await admin
      .from("tb_address_main")
      .update({ addressid: addressId })
      .eq("id", keep.id)
      .eq("userid", userid);
    if (error) return { error: `ตั้งที่อยู่หลักไม่สำเร็จ: ${error.message}` };
  } else {
    const { error } = await admin.from("tb_address_main").insert({ userid, addressid: addressId });
    if (error && error.code !== "23505") return { error: `ตั้งที่อยู่หลักไม่สำเร็จ: ${error.message}` };
    if (error?.code === "23505") {
      const { error: retryErr } = await admin.from("tb_address_main").update({ addressid: addressId }).eq("userid", userid);
      if (retryErr) return { error: `ตั้งที่อยู่หลักไม่สำเร็จ: ${retryErr.message}` };
    }
  }

  const duplicateIds = ordered.filter((row) => row.id !== keep?.id).map((row) => row.id);
  if (duplicateIds.length > 0) {
    const { error } = await admin.from("tb_address_main").delete().in("id", duplicateIds).eq("userid", userid);
    if (error) return { error: `ล้างที่อยู่หลักซ้ำไม่สำเร็จ: ${error.message}` };
  }

  const { error: userErr } = await admin
    .from("tb_users")
    .update({ userAddressID: String(addressId) })
    .eq("userID", userid);
  if (userErr) return { error: `บันทึกที่อยู่สำหรับครั้งถัดไปไม่สำเร็จ: ${userErr.message}` };
  return { error: null };
}
