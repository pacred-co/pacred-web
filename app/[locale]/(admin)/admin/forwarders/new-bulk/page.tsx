/**
 * /admin/forwarders/new-bulk — admin-initiated forwarder create · BULK MODE
 *
 * 2026-06-07 (ภูม flag): "หน้านำเข้า ปุ่มเพิ่มรายการให้ลูกค้า ภูมิอยากให้
 * ออกแบบหน้ามาใหม่ด้วย และ สามารถเพิ่มหลายรายการพร้อมกันได้ด้วยก็ดี".
 *
 * **Why a separate page (not a mode-toggle on /new):** /admin/forwarders/new
 * carries 1,076 lines of single-row logic — cover-image blob lifecycle,
 * AJAX duplicate-tracking check (debounced), per-row warehouse auto-detect,
 * address cascade, tax-doc picker, 10 rounds of พี่ป๊อป UX polish. Stuffing
 * a bulk mode into that file = high regression risk on a money-critical
 * surface ภูม uses TODAY (โกดังรับของจริง). This page reuses the audited
 * `adminCreateForwarder` action verbatim, fires it sequentially per row,
 * and stays 100% additive — the single-row form is untouched.
 *
 * **Shape (v2 — ภูม correction 2026-06-13: "bulk = ลูกค้าหลายคนในใบเดียว
 * ไม่ใช่ลูกค้าคนเดียวกัน"):** bulk mode is for MANY DIFFERENT customers —
 * one customer per row, not one shared customer across all rows.
 *   1. Pick shared shipping options (carrier · transport · tax doc)
 *   2. Fill N rows — EACH row has its OWN customer (inline search picker) +
 *      auto-loaded main address + {tracking · detail · amount}
 *   3. Submit → call adminCreateForwarder N times sequentially · per-row status
 *
 * **Limitations vs single mode (intentional · documented):**
 *   - No per-row cover image upload (admin uploads on /edit after create)
 *   - No per-row warehouse override (server auto-detects from tracking prefix)
 *   - No per-row tax-doc choice (shared · matches typical batch use case)
 *   - No per-row duplicate-tracking AJAX check (server validates on submit)
 *   - Per-row address = the customer's main address (override on /edit)
 *
 * Auth/RBAC unchanged: requireAdmin(["ops","accounting","super"]).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminForwarderNewBulkForm } from "./bulk-form";
import type {
  CustomerOption,
  AddressOption,
} from "@/actions/admin/forwarders-new";

export const dynamic = "force-dynamic";

type SP = { q?: string };

export default async function AdminForwarderNewBulkPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── tb_settings.freeShipping flag (PCSF free-ship option) ──
  const { data: settingsRow, error: settingsRowErr } = await admin
    .from("tb_settings")
    .select("freeshipping")
    .eq("id", 1)
    .maybeSingle<{ freeshipping: string | null }>();
  if (settingsRowErr) {
    console.error(`[tb_settings list bulk] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
  }
  const freeShipping = settingsRow?.freeshipping === "1";

  // ── Optional preset (?q=PR1234) ──
  // Same pattern as single mode — preload customer + addresses so the form
  // opens at step 2 instead of blank.
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
      console.error(`[tb_users bulk preset] failed`, { code: userRowErr.code, message: userRowErr.message });
    }
    if (userRow) {
      presetUser = {
        userID:       userRow.userID,
        userName:     userRow.userName,
        userLastName: userRow.userLastName,
        userTel:      userRow.userTel,
      };
      presetCoid = userRow.coID;
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
    <main className="p-4 lg:p-8 max-w-5xl mx-auto space-y-5 pb-32">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">เพิ่มหลายรายการให้ลูกค้า</span>
      </nav>

      {/* Header + Mode tabs */}
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · ฝากนำเข้า · สร้างออเดอร์หลายรายการ
          </p>
          <h1 className="mt-1 text-2xl font-bold">สร้างฝากนำเข้าหลายรายการพร้อมกัน</h1>
          <p className="mt-1.5 text-sm text-muted">
            หลายลูกค้าในใบเดียว · แต่ละแถวเลือกลูกค้าเอง · ตัวเลือกขนส่งร่วม · ระบบจะสร้างทีละรายการ
            แสดงผลรายแถว
          </p>
        </div>

        {/* Mode tabs — switch between single / bulk · same data flow */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          <Link
            href="/admin/forwarders/new"
            className="px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px border-transparent text-muted hover:text-foreground inline-flex items-center gap-2"
          >
            <span aria-hidden>📋</span>
            <span>เพิ่มทีละรายการ</span>
            <span className="text-[10px] text-muted">(มีอัปโหลดรูป · auto-detect โกดัง)</span>
          </Link>
          <Link
            href="/admin/forwarders/new-bulk"
            className="px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px border-primary-600 text-primary-600 font-semibold inline-flex items-center gap-2"
          >
            <span aria-hidden>📦</span>
            <span>เพิ่มหลายรายการพร้อมกัน</span>
            <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium">ใหม่</span>
          </Link>
        </div>
      </header>

      <AdminForwarderNewBulkForm
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
