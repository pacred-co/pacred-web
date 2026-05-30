import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { listCart } from "@/actions/cart";
import { CartManager } from "./cart-manager";
import { ShoppingCart, Plus, ChevronRight, Home } from "lucide-react";

// Server Component reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

export default async function ServiceOrderCartPage() {
  // D1 cart unification (P0-3/4/5): the cart rows now come from the faithful
  // listCart() → tb_cart (same source as /cart). The page-level rate + default
  // address are also pivoted to the ported tb_* schema so a migrated customer
  // (whose rebuilt `addresses`/`settings` rows are empty) sees real data.
  const cartRes = await listCart();
  const cart    = cartRes.ok ? (cartRes.data ?? []) : [];

  const userData = await getCurrentUserWithProfile();
  const memberCode = userData?.profile?.member_code ?? "";

  const admin = createAdminClient();

  // Default address (pre-fill checkout form) — the customer's most-recent
  // saved tb_address (addressStatus='1'), mapped to the cart-manager's
  // DefaultAddress shape. tb_* is RLS-locked to service_role → admin client;
  // ownership = userid === member_code.
  let defaultAddress: {
    first_name: string; last_name: string; phone: string; phone2: string | null;
    address_line: string; sub_district: string; district: string; province: string;
    postal_code: string; note: string | null;
  } | null = null;
  if (memberCode) {
    const { data: addrRow, error: addrErr } = await admin
      .from("tb_address")
      .select("addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote")
      .eq("userid", memberCode)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: false })
      .limit(1)
      .maybeSingle<{
        addressname: string | null; addresslastname: string | null;
        addresstel: string | null; addresstel2: string | null;
        addressno: string | null; addresssubdistrict: string | null;
        addressdistrict: string | null; addressprovince: string | null;
        addresszipcode: string | null; addressnote: string | null;
      }>();
    if (addrErr) {
      // Soft-fail — the checkout form just renders blank for the customer to fill.
      console.error(`[cart default-address lookup] failed`, { code: addrErr.code, message: addrErr.message });
    }
    if (addrRow) {
      defaultAddress = {
        first_name:   addrRow.addressname ?? "",
        last_name:    addrRow.addresslastname ?? "",
        phone:        addrRow.addresstel ?? "",
        phone2:       addrRow.addresstel2 ?? null,
        address_line: addrRow.addressno ?? "",
        sub_district: addrRow.addresssubdistrict ?? "",
        district:     addrRow.addressdistrict ?? "",
        province:     addrRow.addressprovince ?? "",
        postal_code:  addrRow.addresszipcode ?? "",
        note:         addrRow.addressnote ?? null,
      };
    }
  }

  // Yuan rate from the live legacy settings (tb_settings.rsdefault — the SAME
  // rate the /cart page uses, cart.php L142-145). serviceFee=0: the legacy cart
  // shows no flat fee at order time (the order seeds with no price; admin
  // prices it before payment), so the preview total is just CNY × rate.
  const { data: settings, error: settingsErr } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  if (settingsErr) {
    console.error(`[tb_settings list] failed`, { code: settingsErr.code, message: settingsErr.message });
  }
  const yuanRate    = Number(settings?.rsdefault ?? 5);
  const serviceFee  = 0;

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/service-order" className="hover:text-primary-600">รายการฝากสั่งซื้อสินค้า</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">รถเข็นสินค้า</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-600">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">รถเข็นสินค้า</h1>
                <p className="text-xs text-muted mt-0.5">ตรวจรายการ เลือกขนส่ง แล้วเปิดบิลออเดอร์</p>
              </div>
            </div>
            <Link
              href="/service-order/add"
              className="rounded-lg bg-primary-500 text-white px-3 py-2 text-xs sm:text-sm font-bold hover:bg-primary-600 inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> สั่งสินค้าเพิ่ม
            </Link>
          </div>
        </div>

        <CartManager
          cart={cart}
          yuanRate={yuanRate}
          serviceFee={serviceFee}
          defaultAddress={defaultAddress}
        />
      </main>
    </>
  );
}
