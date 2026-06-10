/**
 * /admin/forwarders/new — admin-initiated forwarder create.
 *
 * Wave 12-C v2 REWRITE (2026-05-23) — match legacy `pcs-admin/forwarder.php`
 * create modal EXACTLY. v1 invented 14 form fields that aren't in the legacy
 * modal (warehouseChina · tracking thai · weight · volume · address typing ·
 * crate · admin note); ภูม rejected on review. Per the design philosophy
 * (docs/learnings/pacred-design-philosophy.md): copy the LEGACY WORKFLOW,
 * keep our Pacred TAILWIND UI.
 *
 * Legacy modal (forwarder.php L754-852) fields = 9 total:
 *   1. coID            (member tier · tb_co dropdown)
 *   2. userID          (cascading user picker · tb_users WHERE coid=?)
 *   3. fTrackingCHN    (text · max 50 · required)
 *   4. fDetail         (textarea · max 500 · required)
 *   5. fAmount         (number · 1-10000 · default 1)
 *   6. fCover          (file · optional · max 9MB)
 *   7. fShipBy         (shipping company dropdown · required)
 *   8. addressID       (cascading address picker · only if fShipBy != 'PCS')
 *   9. fTransportType  (1=รถ · 2=เรือ — legacy has only these two)
 *
 * Address is NEVER typed by the admin — it's looked up from the customer's
 * tb_address rows (or hardcoded to PCS pickup when fShipBy='PCS').
 *
 * Server fetch (this page):
 *   - tb_settings.freeShipping flag (controls whether "PCSF · เหมาๆ 50บ." appears)
 *   - Optional preset user from ?q=PR1234 (also fetch their coid + addresses
 *     so the form opens at the right step).
 *
 * Member-type group + cascading lookups happen client-side via server actions
 * in actions/admin/forwarders-new.ts (fetchUsersByGroup + fetchAddressesByUserid).
 * The member-type dropdown now lists the SAME clean categories /admin/customers
 * uses (ลูกค้าทั่วไป · VIP · SVIP · นิติบุคคล · เครดิต · คิดค่าเทียบ · Freight) —
 * the raw tb_co table is no longer fetched here (ภูม flag round 10).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminForwarderNewForm } from "./form";
import type {
  CustomerOption,
  AddressOption,
} from "@/actions/admin/forwarders-new";

export const dynamic = "force-dynamic";

type SP = { q?: string };

export default async function AdminForwarderNewPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ─── tb_settings.freeShipping ───────────────────────────────────────
  // Legacy `optionHShipByCart()` prepends the "PCSF · เหมาๆ 50บ." option
  // only when tb_settings.freeShipping = '1'. We pass the flag to the
  // client form so it can branch the dropdown the same way.
  const { data: settingsRow, error: settingsRowErr } = await admin
    .from("tb_settings")
    .select("freeshipping")
    .eq("id", 1)
    .maybeSingle<{ freeshipping: string | null }>();
  if (settingsRowErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
  }
  const freeShipping = settingsRow?.freeshipping === "1";

  // ─── Optional preset (?q=PR1234) ────────────────────────────────────
  // Pre-loads the customer + their addresses so the form opens with the
  // user already chosen + the address picker populated.
  let presetUser:      CustomerOption | null  = null;
  let presetCoid:      string | null          = null;
  let presetAddresses: AddressOption[]        = [];

  const qRaw = (sp.q ?? "").trim();
  if (qRaw) {
    const candidate = qRaw.toUpperCase();
    type UserRowShape = {
      userID: string;
      userName: string | null;
      userLastName: string | null;
      userTel: string | null;
      coID: string | null;
    };
    const { data: userRow, error: userRowErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, coID")
      .eq("userID", candidate)
      .maybeSingle<UserRowShape>();
    if (userRowErr) {
      console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
    }

    if (userRow) {
      presetUser = {
        userID:       userRow.userID,
        userName:     userRow.userName,
        userLastName: userRow.userLastName,
        userTel:      userRow.userTel,
      };
      presetCoid = userRow.coID;

      // Preload addresses + main flag (mirrors fetchAddressesByUserid action).
      const [{ data: addrRows }, { data: mainRow }] = await Promise.all([
        admin
          .from("tb_address")
          .select(
            "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2, addressnote",
          )
          .eq("userid", userRow.userID)
          .eq("addressstatus", "1")
          .order("addressid", { ascending: true })
          .limit(50),
        admin
          .from("tb_address_main")
          .select("addressid")
          .eq("userid", userRow.userID)
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

  return (
    <main className="p-4 lg:p-8 max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">เพิ่มรายการให้ลูกค้า</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · ฝากนำเข้า · สร้างออเดอร์ใหม่
        </p>
        <h1 className="mt-1 text-2xl font-bold">สร้างออเดอร์ฝากนำเข้าสินค้า</h1>
        <p className="mt-1.5 text-sm text-muted">
          ใช้เมื่อลูกค้าโทรมาขอให้แอดมินเพิ่มรายการให้ — รายการที่สร้างจะติด
          <span className="mx-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            ฝากนำเข้า · admin
          </span>
          ในรายการ
        </p>
      </header>

      {/* Legacy-fidelity banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 leading-relaxed">
        <strong>✅ Wave 12-C v2 — ตรง legacy 100%:</strong>{" "}
        ฟอร์มนี้ใช้ 9 ช่องเดียวกับ <code className="rounded bg-emerald-100 px-1">pcs-admin/forwarder.php</code> modal เปะๆ
        (coID · userID · tracking · รายละเอียด · จำนวน · รูป · ขนส่ง · ที่อยู่ · รูปแบบขนส่งจีน-ไทย).
        ที่อยู่ดึงจาก <code className="rounded bg-emerald-100 px-1">tb_address</code> ของลูกค้า ไม่ต้องพิมพ์.
        น้ำหนัก/ปริมาตร/CBM ใส่ทีหลัง (รอบแก้ไข).
      </div>

      <AdminForwarderNewForm
        freeShipping={freeShipping}
        presetUser={presetUser}
        presetCoid={presetCoid}
        presetAddresses={presetAddresses}
      />

      {/* Footer */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากนำเข้า
        </Link>
      </div>
    </main>
  );
}
