import { Footer } from "@/components/sections/footer";

export function PagePlaceholder({ title }: { title: string }) {
  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-3 text-sm text-muted">
            หน้านี้ยังเป็น placeholder — feature จะถูกเพิ่มในเฟสถัดไป
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
