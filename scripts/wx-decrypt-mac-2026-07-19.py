#!/usr/bin/env python3
"""
wx-decrypt-mac-2026-07-19.py — WeChat 4.x (Weixin) Mac SQLCipher decryptor.

Same crypto as the 2026-06-29 Windows round (docs/learnings/wechat-china-ops-network-2026-06-29.md):
  SQLCipher4 · page 4096 · reserve 80 (iv[16]+hmac[64]) · salt = db[0:16] · KDF
  PBKDF2-HMAC-SHA512 256000 → 32-byte page key `enc`. We DON'T brute the raw key —
  we scan a MEMORY DUMP of the running WeChat for the DERIVED `enc` (resident while a DB
  is open) and validate each candidate cheaply: mac_key = PBKDF2-SHA512(enc, salt^0x3a, 2),
  page-1 MAC = HMAC-SHA512(mac_key, ct+iv+pageno_LE) == the page's reserved hmac.

Two-step (the memory read is the ONLY part that needs root on macOS · SIP+hardened runtime):
  1) OWNER runs ONCE with sudo (dumps WeChat memory to a core file · owner types their own pw):
       WXPID=$(pgrep -f 'MacOS/WeChat$' | head -1)
       sudo lldb -p "$WXPID" -o "process save-core /tmp/wx.core" -o "detach" -o "quit"
     (WeChat pauses ~a few sec during the dump, then resumes. /tmp/wx.core ≈ 1-3 GB.)
  2) THEN (no root):  python3 scripts/wx-decrypt-mac-2026-07-19.py /tmp/wx.core <db_storage_dir> <outdir>
     → finds each DB's enc from the core, writes decrypted plain-SQLite copies to <outdir>,
       and drops the found keys to <outdir>/_keys.json (reusable until WeChat re-keys).

Non-destructive: reads the DBs + core read-only; writes only to <outdir>.
"""
import sys, os, json, hmac, hashlib, struct, glob
from Crypto.Cipher import AES

PAGE = 4096
RESERVE = 80          # iv(16) + hmac(64)
IV_OFF = PAGE - RESERVE          # 4016
HMAC_OFF = IV_OFF + 16           # 4032
KDF_ITER = 256000
SQLITE_HDR = b"SQLite format 3\x00"

def derive_mac_key(enc: bytes, salt: bytes, dklen: int) -> bytes:
    mac_salt = bytes(b ^ 0x3a for b in salt)
    return hashlib.pbkdf2_hmac("sha512", enc, mac_salt, 2, dklen=dklen)

def page_hmac(mac_key: bytes, ct: bytes, iv: bytes, pageno: int) -> bytes:
    return hmac.new(mac_key, ct + iv + struct.pack("<I", pageno), hashlib.sha512).digest()

def validate_enc(enc: bytes, db_first_page: bytes, salt: bytes) -> bool:
    """page 1: ct = page[16:IV_OFF] (salt is the first 16, not encrypted); iv/hmac in reserve.
       SQLCipher4's page-HMAC key length varies by build (32 or 64) → try both."""
    ct = db_first_page[16:IV_OFF]
    iv = db_first_page[IV_OFF:HMAC_OFF]
    want = db_first_page[HMAC_OFF:PAGE]
    for dklen in (64, 32):
        if hmac.compare_digest(page_hmac(derive_mac_key(enc, salt, dklen), ct, iv, 1), want):
            return True
    return False

def decrypt_db(src: str, enc: bytes) -> bytes:
    raw = open(src, "rb").read()
    salt = raw[:16]
    out = bytearray()
    npages = len(raw) // PAGE
    for i in range(npages):
        page = raw[i * PAGE:(i + 1) * PAGE]
        if len(page) < PAGE:
            break
        start = 16 if i == 0 else 0
        ct = page[start:IV_OFF]
        iv = page[IV_OFF:HMAC_OFF]
        dec = AES.new(enc, AES.MODE_CBC, iv).decrypt(ct)
        if i == 0:
            out += SQLITE_HDR + dec + page[IV_OFF:PAGE]
        else:
            out += dec + page[IV_OFF:PAGE]
    return bytes(out)

def find_enc_in_core(core_path: str, db_first_page: bytes, salt: bytes, candidates=None):
    """Scan the memory dump for the 32-byte window that validates as this DB's enc key.
       An AES-256 key is high-entropy → skip low-entropy windows cheaply (≥24 distinct
       bytes out of 32) so the PBKDF2 validator runs on <1% of offsets. 8-byte-aligned
       first (malloc alignment), then 1-byte fallback. `candidates` (a set of hex offsets
       reused across DBs) is filled on the first DB + reused so later DBs skip the entropy
       pass — the enc keys cluster together in the heap."""
    import mmap
    f = open(core_path, "rb")
    mm = mmap.mmap(f.fileno(), 0, prot=mmap.PROT_READ)
    n = len(mm)
    tested_first = candidates is None
    if candidates is None:
        candidates = []
        for step in (8, 1):
            i = 0
            while i + 32 <= n:
                cand = mm[i:i + 32]
                if len(set(cand)) >= 24:               # high-entropy gate
                    candidates.append(i)
                    if validate_enc(cand, db_first_page, salt):
                        mm.close(); f.close()
                        return cand, candidates
                i += step
            if candidates:
                break  # 8-aligned already collected the high-entropy set
        mm.close(); f.close()
        return None, candidates
    # reuse the collected high-entropy offsets for subsequent DBs
    for off in candidates:
        cand = mm[off:off + 32]
        if validate_enc(cand, db_first_page, salt):
            mm.close(); f.close()
            return cand, candidates
    mm.close(); f.close()
    return None, candidates

def main():
    if len(sys.argv) < 4:
        print("usage: wx-decrypt-mac-2026-07-19.py <core-dump> <db_storage_dir> <outdir>")
        sys.exit(1)
    core, dbdir, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    dbs = sorted(glob.glob(os.path.join(dbdir, "**", "*.db"), recursive=True))
    dbs = [d for d in dbs if not d.endswith(("-wal", "-shm")) and "_fts" not in os.path.basename(d)]
    keys = {}
    cand_cache = None  # high-entropy offsets, collected on the first DB + reused
    print(f"DBs to decrypt: {len(dbs)}")
    for db in dbs:
        raw = open(db, "rb").read()
        if len(raw) < PAGE:
            continue
        salt = raw[:16]
        first = raw[:PAGE]
        name = os.path.relpath(db, dbdir)
        print(f"  scanning core for {name} (salt {salt.hex()[:12]}…) …", flush=True)
        enc, cand_cache = find_enc_in_core(core, first, salt, cand_cache)
        if not enc:
            print(f"    ✗ enc not found (DB maybe not open in WeChat)")
            continue
        keys[name] = enc.hex()
        plain = decrypt_db(db, enc)
        outp = os.path.join(outdir, name.replace("/", "__"))
        open(outp, "wb").write(plain)
        ok = plain[:16] == SQLITE_HDR
        print(f"    ✓ enc={enc.hex()[:16]}… → {outp} ({'valid SQLite' if ok else 'CHECK'})")
    json.dump(keys, open(os.path.join(outdir, "_keys.json"), "w"), indent=2)
    print(f"\n✅ {len(keys)}/{len(dbs)} DBs decrypted → {outdir} · keys → {outdir}/_keys.json")

if __name__ == "__main__":
    main()
