"use client";

/**
 * ปุ่ม "ปักหมุด" ต่อจุดส่ง — คนขับยืนหน้าบ้านลูกค้าแล้วกดบันทึกพิกัด GPS จริง
 * (ปอน 2026-07-24). ใช้ทั้งจอคอมและมือถือ (คอมโพเนนต์เดียว ไม่ก๊อปสองชุด).
 *
 * ลำดับที่ตั้งใจให้เป็น (กันคนลั่น · AGENTS §0f):
 *   กด → ขอตำแหน่งจาก browser → เปิด popup โชว์พิกัด+ความแม่นยำ+ที่อยู่ปัจจุบัน
 *   → ให้เปิด Google Maps ตรวจก่อนได้ → กด "ยืนยันปักหมุด" ถึงจะเขียน DB
 * ไม่มีทางที่กดปุ่มเดียวแล้วเขียนทับที่อยู่ลูกค้าเลย.
 *
 * ⚠️ geolocation ใช้ได้เฉพาะ secure context (https หรือ localhost) — บน
 * http://<ip>:3000 ที่เปิดจากมือถือในวง LAN browser จะปฏิเสธ. ข้อความ error
 * บอกเรื่องนี้ตรงๆ เพราะไม่งั้นจะดูเหมือน "ปุ่มพัง".
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { MapPin, LocateFixed, ExternalLink, Loader2 } from "lucide-react";
import { PacredDialog } from "@/components/ui/pacred-dialog";
import { pinDeliveryLocation } from "@/actions/admin/driver-pin-location";

type Fix = { lat: number; lng: number; accuracyM: number | null };

export function PinLocationButton({
  fids,
  addressText,
  hasPin,
  className,
}: {
  /** ทุกแถว tb_forwarder ของจุดส่งนี้ — ปักครั้งเดียวติดทั้งจุด */
  fids: number[];
  /** ที่อยู่ข้อความปัจจุบัน (โชว์ใน popup ให้เทียบก่อนยืนยัน) */
  addressText: string;
  /** จุดนี้เคยปักหมุดไว้แล้ว → ป้ายเปลี่ยนเป็น "ปักหมุดใหม่" */
  hasPin: boolean;
  className?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function close() {
    dialogRef.current?.close();
    setFix(null);
    setErr(null);
    setDone(null);
  }

  function requestFix() {
    setErr(null);
    setDone(null);
    setFix(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("เบราว์เซอร์นี้ไม่รองรับการอ่านตำแหน่ง");
      dialogRef.current?.showModal();
      return;
    }

    setLocating(true);
    dialogRef.current?.showModal();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (e) => {
        setLocating(false);
        // แยกสาเหตุให้ชัด — "ปุ่มไม่ทำงาน" กับ "ไม่ได้กดอนุญาต" คนละเรื่องกัน
        const msg =
          e.code === e.PERMISSION_DENIED
            ? "เบราว์เซอร์ยังไม่ได้รับอนุญาตให้อ่านตำแหน่ง — กดอนุญาตตำแหน่ง (Location) ให้เว็บนี้ก่อน แล้วลองใหม่"
            : e.code === e.POSITION_UNAVAILABLE
              ? "ยังจับสัญญาณ GPS ไม่ได้ — ลองออกมาที่โล่ง เปิด GPS/Location ของเครื่อง แล้วลองใหม่"
              : e.code === e.TIMEOUT
                ? "รอสัญญาณ GPS นานเกินไป — ลองใหม่อีกครั้ง"
                : "อ่านตำแหน่งไม่สำเร็จ";
        const insecure =
          typeof window !== "undefined" && !window.isSecureContext
            ? " (หน้านี้เปิดผ่าน http ธรรมดา เบราว์เซอร์จะบล็อกการอ่านตำแหน่ง — ต้องเปิดผ่าน https)"
            : "";
        setErr(msg + insecure);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  function confirm() {
    if (!fix) return;
    setErr(null);
    start(async () => {
      const res = await pinDeliveryLocation({
        fids,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracyM ?? undefined,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      const savedToBook = res.data?.updatedAddressBook ?? 0;
      setDone(
        savedToBook > 0
          ? "ปักหมุดแล้ว · อัปเดตที่อยู่จัดส่งของลูกค้าให้ด้วย รอบหน้ากด GoogleMaps จะนำทางมาจุดนี้"
          : "ปักหมุดแล้วสำหรับรอบนี้ (ยังจับคู่กับสมุดที่อยู่ของลูกค้าไม่ได้ — รอบหน้าอาจต้องปักซ้ำ)",
      );
      router.refresh();
    });
  }

  const previewHref = fix ? `https://www.google.com/maps/search/${fix.lat},${fix.lng}` : null;
  const accuracyWarn = fix?.accuracyM != null && fix.accuracyM > 50;

  return (
    <>
      {/* ปุ่มไอคอน+ตัวหนังสือสีแดง (rose-600) ตัวหนา · underline-on-hover = สัญญาณ
          "กดได้" (ปอน 2026-07-24 "เอา badge ออก · สีแดง · ตัวใหญ่"). ไอคอน MapPin
          (หมุดตำแหน่ง · owner "ใช้ไอคอนแบบนี้") h-5. */}
      <button
        type="button"
        onClick={requestFix}
        className={
          className ??
          "group inline-flex shrink-0 items-center gap-1.5 text-rose-600 hover:underline"
        }
      >
        <MapPin className="h-5 w-5 shrink-0" />
        {/* 2 บรรทัดคู่ไอคอน (owner 2026-07-24) — "ปักหมุด" หนาแดง · "ที่อยู่ลูกค้า"
            เล็กบางลง ให้บาลานซ์ความสูงกับไอคอน h-5. */}
        <span className="flex flex-col items-start gap-0.5 leading-none">
          <span className="text-[15px] font-bold">{hasPin ? "ปักหมุดใหม่" : "ปักหมุด"}</span>
          <span className="text-[10px] font-semibold text-rose-600">ที่อยู่ลูกค้า</span>
        </span>
      </button>

      <PacredDialog dialogRef={dialogRef} title="ปักหมุดตำแหน่งจัดส่ง" onClose={close}>
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            บันทึก<strong className="text-foreground">ตำแหน่งที่คุณยืนอยู่ตอนนี้</strong>เป็นพิกัดที่อยู่จัดส่งของจุดนี้
            — รอบหน้ากด &quot;GoogleMaps&quot; จะนำทางมาที่พิกัดนี้แทนการเดาจากข้อความที่อยู่
          </p>

          <div className="rounded-lg border border-border bg-surface-alt/40 p-3">
            <p className="text-[11px] text-muted">ที่อยู่ปัจจุบันบนงานนี้</p>
            <p className="mt-0.5 break-words">{addressText || "— ไม่มีที่อยู่ —"}</p>
          </div>

          {locating && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-white p-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
              <span>กำลังอ่านตำแหน่งจาก GPS…</span>
            </div>
          )}

          {fix && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] text-emerald-700">พิกัดที่จับได้</p>
              <p className="mt-0.5 font-mono text-base font-semibold text-emerald-900 tabular-nums">
                {fix.lat.toFixed(6)}, {fix.lng.toFixed(6)}
              </p>
              {fix.accuracyM != null && (
                <p className={`mt-1 text-[11px] ${accuracyWarn ? "text-amber-700" : "text-emerald-700"}`}>
                  ความแม่นยำ ±{Math.round(fix.accuracyM)} เมตร
                  {accuracyWarn && " — ยังกว้างอยู่ ถ้าอยู่ในตึกลองออกมาข้างนอกแล้วกดอ่านใหม่จะแม่นกว่า"}
                </p>
              )}
              {previewHref && (
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <ExternalLink className="h-3 w-3" /> เปิด Google Maps ดูก่อนว่าตรงจุด
                </a>
              )}
            </div>
          )}

          {err && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>
          )}
          {done && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
              {done}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
            >
              {done ? "ปิด" : "ยกเลิก"}
            </button>
            {!done && (
              <>
                <button
                  type="button"
                  onClick={requestFix}
                  disabled={locating || pending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt disabled:opacity-60"
                >
                  <LocateFixed className="h-4 w-4" /> อ่านตำแหน่งใหม่
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!fix || locating || pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <MapPin className="h-4 w-4" />
                  {pending ? "กำลังบันทึก…" : "ยืนยันปักหมุด"}
                </button>
              </>
            )}
          </div>
        </div>
      </PacredDialog>
    </>
  );
}
