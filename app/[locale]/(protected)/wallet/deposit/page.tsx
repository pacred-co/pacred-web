import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getWallet } from "@/actions/wallet";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { DepositForm } from "./deposit-form";
import { Plus, ChevronRight, Home, Wallet as WalletIcon } from "lucide-react";

export default async function WalletDepositPage() {
  const [walletRes, userData] = await Promise.all([
    getWallet(),
    getCurrentUserWithProfile(),
  ]);
  const balance = walletRes.ok ? (walletRes.data?.balance ?? 0) : 0;
  const profile = userData?.profile;
  const fullName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.company_name || "ลูกค้า Pacred"
    : "ลูกค้า Pacred";

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/wallet/history" className="hover:text-primary-600">กระเป๋าสตางค์</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">เติมเงิน</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">เติมเงินเข้ากระเป๋าสตางค์ Pacred</h1>
                <p className="text-xs text-muted mt-0.5">โอนผ่าน PromptPay → แนบสลิป → Pacred ตรวจสอบและเข้าเงินภายใน 30 นาทีในเวลาทำการ</p>
              </div>
            </div>
            <Link
              href="/wallet/history"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ← กลับกระเป๋าสตางค์
            </Link>
          </div>
        </div>

        {/* Wallet balance hero */}
        <div className="rounded-2xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5 shadow-md overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold opacity-90">{fullName}</p>
              <p className="text-xs opacity-80 mt-0.5">ยอดกระเป๋าปัจจุบัน (บาท)</p>
              <p className="font-mono text-4xl sm:text-5xl font-black mt-1 leading-none">
                {balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="shrink-0 opacity-70">
              <WalletIcon className="w-14 h-14" />
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-white/20">
            <div className="h-full w-full rounded-full bg-white/80" />
          </div>
        </div>

        <DepositForm />

        {/* Terms (PCS-style numbered list) */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h3 className="font-bold text-amber-800 flex items-center gap-2">
            ⚠️ เงื่อนไขการเติมเงิน / ถอนเงิน ที่ต้องทราบก่อน
          </h3>
          <ol className="mt-3 text-sm text-amber-900 space-y-1.5 list-decimal pl-5">
            <li>สามารถถอนเงินกลับได้เมื่อท่านเคยชำระค่าฝากสั่งซื้อ หรือฝากนำเข้ากับ Pacred มาก่อน</li>
            <li>การถอนเงินต้องแนบ <b>บัตรประจำตัวประชาชน</b> และ <b>หน้าสมุดบัญชีธนาคาร</b> ผ่านเซลล์ผู้ดูแล</li>
            <li>ยอดถอนเงินขั้นต่ำ <b>25 บาท</b>; ยอดต่ำกว่า <b>500 บาท</b> มีค่าบริการ <b>25 บาท/ครั้ง</b></li>
            <li>การเติมเงินด้วย PromptPay จะเข้าเงินอัตโนมัติเมื่อ Pacred ตรวจสลิปแล้ว (ประมาณ 15-30 นาทีในเวลาทำการ)</li>
            <li>กรณีโอนผิดบัญชี Pacred จะคืนเงินภายใน 7 วันทำการ</li>
            <li>Pacred ขอสงวนสิทธิ์ในการเปลี่ยนแปลงนโยบายไปตามเงื่อนไขที่บริษัทกำหนด</li>
          </ol>
        </div>
      </main>
      <Footer />
    </>
  );
}
