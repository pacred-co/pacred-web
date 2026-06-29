#!/usr/bin/env node
/**
 * RMFH WeChat-4.0 Windows phone-backup decryptor (2026-06-29).
 *
 * Format (confirmed vs the real "All wechat.zip" + the published RE writeups
 * blog.csdn.net/weixin_42376192/154657886 · ctfiot.com/275982 · 52pojie 2068774):
 *   - Every container file (ChatPackage/<range>, Index/*, Media/*_m, *.tar.enc,
 *     *.attr, tar_index.dat) is an RMFH blob: 128-byte header "RMFH" + AES-256-GCM
 *     ciphertext + 128-byte "RMFT" footer.
 *   - AES-256-GCM. NONCE/IV = header bytes [19:31] (12 bytes). TAG = footer bytes
 *     [10:26] (16 bytes). CIPHERTEXT = bytes[128 : len-128].
 *   - ChatPackage plaintext = protobuf (WeChat msg records). Media .tar.enc
 *     plaintext = an ordinary tar of small media. *_m = a single media file.
 *
 * THE KEY: a 32-byte AES-256 key, FIXED per WeChat account, held ONLY on the
 * source phone. It is NOT in the zip / not in backup.attr (itself RMFH) / not in
 * Windows memory. Get it once via Frida on the rooted source phone:
 *   hook libaff_biz.so → EVP_EncryptInit_ex / sub_A0061C, dump the 32-byte key arg.
 * Then run:  node scripts/rmfh-wechat-decrypt.mjs <zip> <key-hex-64chars> <outdir>
 *
 * Once a real key is supplied this decrypts every ChatPackage → a text dump
 * (raw protobuf strings: Thai/Chinese messages + tracking numbers) and every
 * media to <outdir>. Until then it is a ready, untested-pending-key tool.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const [zipPath, keyHex, outDir = "rmfh-out"] = process.argv.slice(2);
if (!zipPath || !keyHex || keyHex.length !== 64) {
  console.error("usage: node scripts/rmfh-wechat-decrypt.mjs <zip> <key-hex-64> <outdir>");
  console.error("  (key = 32-byte AES-256 key in hex; Frida-extracted from the source phone)");
  process.exit(1);
}
const KEY = Buffer.from(keyHex, "hex");

function rmfhDecrypt(buf) {
  if (buf.length < 256 || buf.subarray(0, 4).toString() !== "RMFH") return null;
  const iv = buf.subarray(19, 31);            // 12-byte GCM nonce
  const footer = buf.subarray(buf.length - 128);
  if (footer.subarray(0, 4).toString() !== "RMFT") {
    // footer marker can sit a few bytes in; search it
    const idx = buf.lastIndexOf(Buffer.from("RMFT"));
    if (idx < 0) return null;
    const f2 = buf.subarray(idx);
    const tag2 = f2.subarray(10, 26);
    const ct2 = buf.subarray(128, idx);
    return gcm(ct2, iv, tag2);
  }
  const tag = footer.subarray(10, 26);        // 16-byte GCM tag
  const ct = buf.subarray(128, buf.length - 128);
  return gcm(ct, iv, tag);
}
function gcm(ct, iv, tag) {
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  } catch (e) { return null; }
}

// Use the system unzip into a temp dir (node has no stdlib unzip); then walk.
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "rmfh-"));
execSync(`tar -xf "${zipPath}" -C "${tmp}"`, { stdio: "inherit" }); // tar reads zip on win10+
let ok = 0, fail = 0;
const txt = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const buf = fs.readFileSync(p);
    if (buf.subarray(0, 4).toString() !== "RMFH") continue;
    const dec = rmfhDecrypt(buf);
    if (!dec) { fail++; continue; }
    ok++;
    if (p.includes("ChatPackage") || p.includes("Index")) {
      // protobuf — best-effort: pull readable utf-8 runs (Thai/Chinese/ascii)
      const s = dec.toString("utf8").match(/[฀-๿一-鿿\x20-\x7E]{3,}/g) || [];
      txt.push(`\n===== ${path.relative(tmp, p)} =====\n` + s.join("\n"));
    } else {
      fs.writeFileSync(path.join(outDir, path.basename(p) + ".bin"), dec);
    }
  }
}
walk(tmp);
fs.writeFileSync(path.join(outDir, "chat-text.txt"), txt.join("\n"), "utf8");
console.log(`decrypted ${ok} blobs (${fail} failed) → ${outDir}/  (chat-text.txt + media .bin)`);
