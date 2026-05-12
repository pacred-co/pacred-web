import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getCurrentYuanRate } from "@/actions/payment";
import { getWallet } from "@/actions/wallet";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { YuanPaymentForm } from "../yuan-payment-form";
import { ArrowLeftRight, ChevronRight, Home } from "lucide-react";

export default async function ServicePaymentAddPage() {
  const [rateRes, walletRes, userData] = await Promise.all([
    getCurrentYuanRate(),
    getWallet(),
    getCurrentUserWithProfile(),
  ]);
  const balance = walletRes.ok ? (walletRes.data?.balance ?? 0) : 0;
  const profile = userData?.profile;
  const fullName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.company_name || "—"
    : "—";

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/service-payment" className="hover:text-primary-600">ฝากชำระ / โอนหยวน</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">เพิ่มรายการฝากชำระ</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600">
                <ArrowLeftRight className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">สร้างออเดอร์ฝากชำระสินค้า</h1>
                <p className="text-xs text-muted mt-0.5">ฝากให้ Pacred โอนเงินหยวนไปร้านค้าจีน — Alipay / WeChat / โอนผ่านธนาคาร</p>
              </div>
            </div>
            <Link
              href="/service-payment"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ← กลับรายการ
            </Link>
          </div>
        </div>

        <YuanPaymentForm
          rate={rateRes.rate}
          rateUpdatedAt={rateRes.updated_at}
          walletBalance={balance}
          customerName={fullName}
        />
      </main>
      <Footer />
    </>
  );
}
