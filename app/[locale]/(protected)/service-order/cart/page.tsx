import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCart } from "@/actions/cart";
import { CartManager } from "./cart-manager";
import { ShoppingCart, Plus, ChevronRight, Home } from "lucide-react";

export default async function ServiceOrderCartPage() {
  const cartRes = await listCart();
  const cart    = cartRes.ok ? (cartRes.data ?? []) : [];

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }

  // Default address (pre-fill checkout form)
  const { data: defaultAddress } = user
    ? await supabase
        .from("addresses")
        .select("first_name, last_name, phone, phone2, address_line, sub_district, district, province, postal_code, note")
        .eq("profile_id", user.id)
        .eq("is_default", true)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  // Yuan rate + service fee from settings singleton
  const { data: settings, error: settingsErr } = await supabase
    .from("settings")
    .select("yuan_rate, service_fee")
    .eq("id", 1)
    .maybeSingle<{ yuan_rate: number; service_fee: number }>();
  if (settingsErr) {
    console.error(`[settings list] failed`, { code: settingsErr.code, message: settingsErr.message });
  }
  const yuanRate    = Number(settings?.yuan_rate ?? 5);
  const serviceFee  = Number(settings?.service_fee ?? 50);

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
