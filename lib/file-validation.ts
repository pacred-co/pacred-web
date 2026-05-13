/**
 * Server-side file validation — check magic bytes + size on files
 * already uploaded to Supabase Storage.
 *
 * Why: client-declared MIME (`file.type`) is trivially spoofed. Real
 * validation must read the first bytes of the file ("magic bytes") and
 * match a known signature. Combined with size + server-side allowlist,
 * this prevents executable/malicious uploads from being accepted.
 *
 * Usage in a server action that receives a storage path:
 *
 *   import { validateStoredFile } from "@/lib/file-validation";
 *
 *   const check = await validateStoredFile("slips", slipPath, ["image", "pdf"]);
 *   if (!check.ok) return { ok: false, error: check.error };
 *
 * Cost: downloads the full file from Storage (need bytes for magic
 * check). For small files (≤5 MB) this is acceptable. To optimize,
 * upgrade to a Range header request for first 12 bytes only.
 *
 * Server-only.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type FileKind = "image" | "pdf";

type MagicSignature = {
  mime:   string;
  kind:   FileKind;
  bytes:  number[];
  offset: number;
};

// Common image + PDF signatures (https://en.wikipedia.org/wiki/List_of_file_signatures)
const SIGNATURES: MagicSignature[] = [
  // JPEG — 3 byte sentinel (the 4th byte varies per encoder)
  { mime: "image/jpeg", kind: "image", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG
  { mime: "image/png",  kind: "image", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // GIF87a + GIF89a
  { mime: "image/gif",  kind: "image", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { mime: "image/gif",  kind: "image", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  // WebP — RIFF...WEBP (signature split across offset 0 + 8)
  { mime: "image/webp", kind: "image", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  // PDF — "%PDF-"
  { mime: "application/pdf", kind: "pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

function matchMagic(buf: Uint8Array): MagicSignature | null {
  for (const sig of SIGNATURES) {
    if (buf.length < sig.offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      // WebP needs the secondary "WEBP" marker at offset 8
      if (sig.mime === "image/webp") {
        const webpMarker = [0x57, 0x45, 0x42, 0x50];
        if (buf.length < 12) return null;
        for (let i = 0; i < 4; i++) {
          if (buf[8 + i] !== webpMarker[i]) return null;
        }
      }
      return sig;
    }
  }
  return null;
}

export type ValidateResult =
  | { ok: true;  mime: string; kind: FileKind; bytes: number }
  | { ok: false; error: string };

/**
 * Validate an already-uploaded file. Returns the actual MIME/kind on success.
 *
 * @param bucket          Supabase Storage bucket name
 * @param path            Object path within the bucket
 * @param allowedKinds    Kinds accepted (e.g. ["image", "pdf"] for slips)
 * @param maxBytes        Hard size limit (default 5 MB)
 */
export async function validateStoredFile(
  bucket: string,
  path: string,
  allowedKinds: FileKind[],
  maxBytes = 5 * 1024 * 1024,
): Promise<ValidateResult> {
  if (!path || typeof path !== "string") return { ok: false, error: "invalid_path" };

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from(bucket).download(path);

  if (error || !blob) {
    return { ok: false, error: error?.message ?? "download_failed" };
  }

  // Size check
  if (blob.size > maxBytes) {
    return { ok: false, error: `file_too_large:${blob.size}>${maxBytes}` };
  }
  if (blob.size === 0) {
    return { ok: false, error: "empty_file" };
  }

  // Magic bytes check — read first 16 bytes only
  const head = await blob.slice(0, 16).arrayBuffer();
  const sig  = matchMagic(new Uint8Array(head));

  if (!sig) {
    return { ok: false, error: "unrecognized_format" };
  }

  if (!allowedKinds.includes(sig.kind)) {
    return { ok: false, error: `disallowed_kind:${sig.kind}` };
  }

  return { ok: true, mime: sig.mime, kind: sig.kind, bytes: blob.size };
}
