/**
 * In-house OCR service — read text out of an image, entirely in our system.
 *
 * Owner 2026-07-08: "ทำเครื่องมือเองเพิ่มมาในระบบเราเอง · ต่อยอดใช้ได้ทั้ง platform".
 * Engine = Tesseract.js (WASM · open-source · runs in the browser). NO paid vision
 * API, NO per-call cost, and the image NEVER leaves the browser — only the engine
 * (self-hosted at /public/tesseract) runs locally, and the language dictionary is a
 * static file. Reusable everywhere: slips · ใบกำกับ · packing lists · ใบขน · QR labels.
 *
 * CSP-safe: the worker + core wasm are served SAME-ORIGIN from /public/tesseract
 * (script-src 'self'); the traineddata is fetched over connect-src https:. No CSP
 * change needed. workerBlobURL:false so no blob: worker is created.
 *
 * Browser-only — import from "use client" components. Lang packs load lazily on
 * first use (chi_sim ≈ a few MB · cached by the browser after).
 */

import { createWorker, type Worker } from "tesseract.js";

// One cached worker per language-set (creating a worker + loading a lang pack is
// the expensive part — reuse it across calls on the same page).
const workers = new Map<string, Promise<Worker>>();

function getWorker(langs: string): Promise<Worker> {
  let w = workers.get(langs);
  if (!w) {
    w = createWorker(langs, 1, {
      // Self-hosted engine (same-origin · CSP script-src 'self').
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
      // Language dictionaries — static files over connect-src https: (not our
      // repo, but a plain data download; the OCR itself runs locally).
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      workerBlobURL: false,
      gzip: true,
    });
    workers.set(langs, w);
  }
  return w;
}

export type OcrResult = { text: string; lines: string[] };

/**
 * OCR an image file → extracted text + non-empty lines.
 * @param file  an image File (JPG/PNG/…) — PDFs are not rasterised here.
 * @param langs Tesseract lang codes joined by "+" (default Simplified-Chinese + English).
 */
export async function recognizeImage(file: File, langs = "chi_sim+eng"): Promise<OcrResult> {
  if (typeof window === "undefined") return { text: "", lines: [] };
  const worker = await getWorker(langs);
  const { data } = await worker.recognize(file);
  const text = (data.text ?? "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { text, lines };
}
