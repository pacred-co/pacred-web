/**
 * <ForwarderExceptionPanel> — server wrapper for the parcel-exception control
 * on /admin/forwarders/[fNo] (gap G7 · เดฟ 2026-06-30).
 *
 * Reads the current fexception_* state best-effort (degrades to "no exception"
 * if mig 0230 isn't applied yet — so a pre-0230 env doesn't 500 the detail page),
 * resolves an existing exception photo to a signed URL, then renders the client
 * control. Gated by the host page's requireAdmin; the flag/resolve actions
 * re-gate to ops/warehouse/super themselves.
 *
 * §0e: this surface only RECORDS exceptions — the actions write ONLY fexception_*.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { ForwarderExceptionPanelClient } from "./forwarder-exception-panel-client";
import { EXCEPTION_TYPES, type ExceptionType } from "@/actions/admin/forwarder-exception";

function asExceptionType(v: string | null): ExceptionType | null {
  if (v && (EXCEPTION_TYPES as readonly string[]).includes(v)) return v as ExceptionType;
  return null;
}

export async function ForwarderExceptionPanel({ fNo }: { fNo: number }) {
  const admin = createAdminClient();

  let currentType: ExceptionType | null = null;
  let currentNote: string | null = null;
  let currentStatus: string | null = null;
  let currentPhoto: string | null = null;

  const { data, error } = await admin
    .from("tb_forwarder")
    .select("fexception_type, fexception_note, fexception_status, fexception_photo")
    .eq("id", fNo)
    .maybeSingle<{
      fexception_type: string | null;
      fexception_note: string | null;
      fexception_status: string | null;
      fexception_photo: string | null;
    }>();
  if (error) {
    // 42703 = column not yet added (mig 0230 not applied) → render the flag form
    // anyway (the action will surface a clear error until the migration lands).
    if (error.code !== "42703" && !/fexception/i.test(error.message ?? "")) {
      console.error(`[ForwarderExceptionPanel read] failed`, { code: error.code, message: error.message, fNo });
    }
  } else if (data) {
    currentType = asExceptionType(data.fexception_type);
    currentNote = data.fexception_note;
    currentStatus = data.fexception_status;
    currentPhoto = data.fexception_photo;
  }

  const currentPhotoUrl = currentPhoto ? await getSignedBucketUrl("slips", currentPhoto) : null;

  return (
    <ForwarderExceptionPanelClient
      fNo={fNo}
      currentType={currentType}
      currentNote={currentNote}
      currentStatus={currentStatus}
      currentPhotoUrl={currentPhotoUrl}
    />
  );
}
