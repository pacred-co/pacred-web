import { PackageSearch, MapPin, Clock, ShieldCheck } from "lucide-react";
import { LINE_OA } from "@/components/seo/site";
import { TrackForm } from "./track-form";

/**
 * Public parcel-tracking landing (Task 2 · ปอน · 2026-06-02) — the headline
 * "ไม่ต้องโทรถาม" USP. No login: paste a China-courier tracking number → see
 * the status timeline on /track/<code>. Public route group (no auth gate).
 */
export const metadata = {
  title: "ติดตามพัสดุ · เช็คสถานะสินค้านำเข้าจากจีน — Pacred",
  description:
    "เช็คสถานะพัสดุนำเข้าจากจีนแบบเรียลไทม์ ไม่ต้องโทรถาม ไม่ต้องเข้าสู่ระบบ — กรอกเลขแทร็คกิ้งแล้วดูได้เลยว่าสินค้าถึงไหนแล้ว Track your China-import parcel — no login needed.",
};

const PERKS = [
  { icon: MapPin, text: "รู้ทุกขั้นตอน ตั้งแต่โกดังจีนถึงหน้าบ้าน" },
  { icon: Clock, text: "ดูเวลาแต่ละสถานะ + ประมาณการถึงไทย" },
  { icon: ShieldCheck, text: "ไม่ต้องเข้าสู่ระบบ — แค่มีเลขพัสดุก็เช็คได้" },
];

export default function TrackLandingPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-1 text-xs font-semibold text-red-700">
          <PackageSearch className="h-4 w-4" />
          ติดตามพัสดุ Pacred
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">
          สินค้าถึงไหนแล้ว? เช็คได้เลย ไม่ต้องโทรถาม
        </h1>
        <p className="mx-auto mt-2.5 max-w-md text-[15px] leading-relaxed text-muted">
          กรอกเลขพัสดุ / เลขแทร็คกิ้งจีนที่ได้รับ แล้วดูสถานะการนำเข้าแบบเรียลไทม์
          ตั้งแต่โกดังจีนจนถึงมือคุณ
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface sm:p-5">
        <TrackForm autoFocus />
      </div>

      <ul className="mt-6 space-y-2.5">
        {PERKS.map((p) => (
          <li
            key={p.text}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-alt/30 px-4 py-3"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <p.icon className="h-5 w-5" />
            </span>
            <span className="text-sm text-foreground">{p.text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-xl border border-border bg-surface-alt/30 px-4 py-4 text-center text-sm text-muted">
        หาเลขพัสดุไม่เจอ หรือมีคำถามเรื่องการนำเข้า?{" "}
        <a
          href={LINE_OA.addFriendUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary-600 hover:underline"
        >
          ทักแชทไลน์ {LINE_OA.premiumId}
        </a>{" "}
        ทีมงานพร้อมช่วยทันที
      </div>
    </main>
  );
}
