import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";

export default async function CompleteProfilePage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.user) redirect("/login");

  // If already active, no need to be here
  if (data.profile?.status === "active") redirect("/dashboard");

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-[520px] rounded-[18px] bg-white dark:bg-surface p-8 shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
          <h1 className="text-center text-2xl font-bold text-foreground">
            ทำโปรไฟล์ให้สมบูรณ์
          </h1>
          <p className="mt-2 text-center text-sm text-muted">
            บัญชีของคุณยังไม่สมบูรณ์ กรุณาเพิ่มข้อมูลที่ขาดอยู่
          </p>

          <div className="mt-6 space-y-3 rounded-lg border border-dashed border-border bg-zinc-50 dark:bg-surface-alt p-4">
            <p className="text-sm text-muted">
              <strong className="text-foreground">หมายเหตุ:</strong>{" "}
              หน้านี้เป็น placeholder — แบบฟอร์มกรอกข้อมูลที่ขาดจะถูกสร้างในเฟสถัดไป
            </p>
            <p className="text-xs text-muted">
              สถานะปัจจุบัน:{" "}
              <span className="font-semibold text-primary-600">
                {data.profile?.status ?? "ยังไม่มี profile"}
              </span>
            </p>
            <p className="text-xs text-muted">
              ประเภทบัญชี:{" "}
              <span className="font-semibold">
                {data.profile?.account_type ?? "—"}
              </span>
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href="/"
              className="flex-1 rounded-lg border border-border bg-white dark:bg-surface px-4 py-2.5 text-center text-sm font-semibold text-muted transition hover:border-primary-500 hover:text-primary-600"
            >
              กลับหน้าแรก
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
