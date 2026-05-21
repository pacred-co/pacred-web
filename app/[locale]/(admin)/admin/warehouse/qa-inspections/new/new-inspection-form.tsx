"use client";

/**
 * Client form for /admin/warehouse/qa-inspections/new.
 *
 * Flow:
 *   1. Enter forwarder f_no (the import-job id).
 *   2. Pick verdict (pass / fail / hold / fake_product).
 *   3. Optionally enter notes + select 1..20 photo files.
 *   4. Submit → photos upload sequentially → adminCreateQaInspection
 *      with the array of storage paths → navigate to /[id].
 *
 * Photo upload uses `adminUploadQaPhoto` server action; the resulting
 * paths are passed in the create payload as `photo_urls`.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  adminCreateQaInspection,
  adminUploadQaPhoto,
  type QaVerdict,
} from "@/actions/admin/qa-inspections";

const VERDICTS: QaVerdict[] = ["pass", "fail", "hold", "fake_product"];
const MAX_PHOTOS = 20;

export function NewInspectionForm({
  initialForwarderFNo,
}: {
  initialForwarderFNo: string;
}) {
  const t = useTranslations("qaInspection");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [fNo, setFNo] = useState<string>(initialForwarderFNo);
  const [verdict, setVerdict] = useState<QaVerdict>("pass");
  const [notes, setNotes] = useState<string>("");
  const [blacklist, setBlacklist] = useState<boolean>(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>): void {
    const list = e.target.files;
    if (!list) return;
    const picked = Array.from(list).slice(0, MAX_PHOTOS);
    setFiles(picked);
  }

  function onVerdictChange(v: QaVerdict): void {
    setVerdict(v);
    if (v === "fake_product") setBlacklist(true);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    if (!fNo || !/^\d+$/.test(fNo.trim())) {
      setError(t("err.fNoRequired"));
      return;
    }

    startTransition(async () => {
      // 1) Upload photos (sequential to keep error reporting clear).
      const draftKey = `drafts/${Math.random().toString(36).slice(2, 10)}`;
      const photoPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(t("uploadingProgress", { i: i + 1, n: files.length }));
        const fd = new FormData();
        fd.append("file", files[i]!);
        fd.append("draftKey", draftKey);
        const upRes = await adminUploadQaPhoto(fd);
        if (!upRes.ok) {
          setError(`${t("err.uploadFailed")}: ${upRes.error}`);
          setUploadProgress("");
          return;
        }
        photoPaths.push(upRes.data!.storage_path);
      }
      setUploadProgress("");

      // 2) Create the inspection.
      const res = await adminCreateQaInspection({
        forwarder_f_no: fNo.trim(),
        verdict,
        notes:          notes.trim() || undefined,
        photo_urls:     photoPaths,
        blacklist_shop: blacklist,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/warehouse/qa-inspections/${res.data!.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <div>
        <label htmlFor="qa-fno" className="block text-xs font-semibold mb-1">
          {t("form.fNoLabel")}
        </label>
        <input
          id="qa-fno"
          type="text"
          inputMode="numeric"
          value={fNo}
          onChange={(e) => setFNo(e.target.value)}
          placeholder={t("form.fNoPlaceholder")}
          className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[10px] text-muted">{t("form.fNoHelp")}</p>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">{t("col.verdict")}</label>
        <div className="flex flex-wrap gap-2">
          {VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onVerdictChange(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                verdict === v
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-border bg-white text-foreground hover:bg-surface-alt"
              }`}
            >
              {t(`verdict.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="qa-notes" className="block text-xs font-semibold mb-1">
          {t("notesLabel")}
        </label>
        <textarea
          id="qa-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          placeholder={t("notesPlaceholder")}
        />
      </div>

      <div>
        <label htmlFor="qa-photos" className="block text-xs font-semibold mb-1">
          {t("form.photosLabel")}
        </label>
        <input
          id="qa-photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={onFilePick}
          className="block w-full text-sm"
        />
        <p className="mt-1 text-[10px] text-muted">
          {t("form.photosHelp", { max: MAX_PHOTOS })}
          {files.length > 0 && ` · ${files.length} ${t("form.photosSelected")}`}
        </p>
      </div>

      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={blacklist}
            disabled={verdict === "fake_product"}
            onChange={(e) => setBlacklist(e.target.checked)}
          />
          <span>
            {t("blacklistLabel")}
            {verdict === "fake_product" && (
              <span className="ml-1 text-[10px] text-red-600">({t("blacklistAutoFake")})</span>
            )}
          </span>
        </label>
      </div>

      {uploadProgress && (
        <div className="text-xs text-muted">{uploadProgress}</div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? t("savingBtn") : t("createBtn")}
        </button>
      </div>
    </form>
  );
}
