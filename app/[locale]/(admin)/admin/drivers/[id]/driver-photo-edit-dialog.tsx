"use client";

/**
 * ถ่าย / แก้ไขภาพส่งสินค้า — per delivery-point popup (ภูม 2026-07-10).
 *
 * Faithful port of legacy `forwarder-driver.php` `takePhoto()` → the
 * "ถ่ายภาพสินค้าที่ส่ง" modal (ถ่ายใหม่ / บันทึกภาพ). The button label mirrors
 * legacy: "ถ่ายส่งสินค้า" when no photo yet, "แก้ภาพ" once a delivery photo
 * exists. On save it POSTs the (compressed) image to
 * `adminEditDriverDeliveryPhoto` which (re)writes the delivery photo on every
 * covered driver-item + forwarder and marks any not-yet-delivered item delivered.
 *
 * Camera-first (capture="environment") so a warehouse/driver on a phone snaps
 * the parcel directly. Client-side compress (compressImageFile) keeps the upload
 * well under the body-size limit (the /forwarders/new 1 MB-limit trap · §0f).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Camera, Pencil, X } from "lucide-react";
import { compressImageFile } from "@/lib/image-compress";
import { adminEditDriverDeliveryPhoto } from "@/actions/admin/driver-work";

export function DriverPhotoEditDialog({
  itemIds,
  hasPhoto,
  disabled = false,
  gradient = false,
}: {
  /** tb_forwarder_driver_item.id(s) covered by this delivery point. */
  itemIds: number[];
  /** A delivery photo already exists → the button reads "แก้ภาพ". */
  hasPhoto: boolean;
  disabled?: boolean;
  /** ปุ่มพื้นหลัง gradient + text ขาว (หัวการ์ดมือถือ · ปอน 2026-07-24) · default = outline เดิม (เดสก์ท็อป zone-3 ไม่เปลี่ยน). */
  gradient?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function openPicker() {
    setErr(null);
    requestAnimationFrame(() => fileRef.current?.click());
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    // Compress in-browser (fails soft → original file) then preview + open the modal.
    const compact = await compressImageFile(f, { maxDim: 1600, quality: 0.82 }).catch(() => f);
    setPreviewFile(compact);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(compact);
    });
    setOpen(true);
  }

  function close() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    setErr(null);
    setOpen(false);
  }

  function save() {
    if (!previewFile || itemIds.length === 0) return;
    const fd = new FormData();
    fd.append("itemIds", itemIds.join(","));
    fd.append("photo", previewFile, previewFile.name || "delivery.jpg");
    setErr(null);
    start(async () => {
      const res = await adminEditDriverDeliveryPhoto(fd);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      {/* Hidden camera/file input — one instance, opened by both the trigger + ถ่ายใหม่. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className="sr-only"
        aria-hidden="true"
      />

      {/* gradient = ปุ่ม "ถ่ายส่ง" ในแถวปุ่มท้ายการ์ดมือถือ (owner 2026-07-24
          "ปุ่มกลมมน") → pill rounded-full เต็มความกว้างช่อง · ไอคอนกล้องใหญ่ =
          ดูออกทันทีว่ากดถ่ายได้. non-gradient = เดสก์ท็อป (แถวปุ่มในตาราง) pill เล็กเหมือนเดิม. */}
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || pending}
        className={`inline-flex items-center justify-center gap-1 border font-semibold transition disabled:opacity-50 ${
          gradient
            ? "w-full rounded-full px-2 py-1.5 text-xs " +
              (hasPhoto
                ? "border-amber-600 bg-amber-600 text-white shadow-sm hover:bg-amber-700"
                : "border-[#C82333] bg-[#C82333] text-white shadow-sm hover:bg-[#B21F2D]")
            : "rounded-full px-2.5 py-1 text-[11px] " +
              (hasPhoto
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100")
        }`}
      >
        {hasPhoto
          ? <Pencil className={gradient ? "h-4 w-4" : "h-3 w-3"} />
          : <Camera className={gradient ? "h-4 w-4" : "h-3 w-3"} />}
        {hasPhoto ? "แก้ภาพ" : gradient ? "ถ่ายส่ง" : "ถ่ายส่งสินค้า"}
      </button>

      {/* Modal — legacy "ถ่ายภาพสินค้าที่ส่ง" (ถ่ายใหม่ / บันทึกภาพ). */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold text-foreground">ถ่ายภาพสินค้าที่ส่ง</h3>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded-full p-1 text-muted hover:bg-surface-alt disabled:opacity-50"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-border bg-gray-50">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="รูปส่งสินค้า" className="h-auto max-h-[380px] w-full object-contain" />
                ) : (
                  <div className="flex h-40 items-center justify-center text-xs text-muted">ยังไม่มีรูป</div>
                )}
                {pending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium">⏳ กำลังบันทึก...</span>
                  </div>
                )}
              </div>

              {err && (
                <p className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-700">{err}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={pending || !previewFile}
                  className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  บันทึกภาพ
                </button>
                <button
                  type="button"
                  onClick={openPicker}
                  disabled={pending}
                  className="rounded-xl border-2 border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-alt disabled:opacity-60"
                >
                  ถ่ายใหม่
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
