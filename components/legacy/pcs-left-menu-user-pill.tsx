"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ChevronDown, LifeBuoy, LogOut, Settings, User } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/actions/auth";

/**
 * Legacy PCS Cargo customer-portal — the user-pill at the top of the left
 * sidebar. Avatar + member_code + a 3-item dropdown (profile / settings /
 * sign-out). The legacy version was a jQuery `.has-sub` accordion; here we
 * replace that with a tiny `useState` toggle + a rotating chevron. Extracted
 * as a Client Component so the parent `PcsLeftMenu` can stay a Server
 * Component (the legacy data layer runs on the server).
 */
export function PcsLeftMenuUserPill({
  userID,
  userPicture,
  fullName,
  contactName,
}: {
  userID: string;
  userPicture: string;
  fullName?: string;
  /** Contact-person sub-line (juristic → fullName=company). "" = hidden. */
  contactName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <img
          src={userPicture}
          alt=""
          className="h-11 w-11 rounded-full object-cover ring-2 ring-red-100"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{userID}</span>
          {fullName ? (
            <span className="block truncate text-[12px] text-muted">{fullName}</span>
          ) : null}
          {contactName ? (
            <span className="block truncate text-[11px] text-muted">ผู้ติดต่อ: {contactName}</span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="border-t border-border bg-gray-50/60 py-1">
          <Link
            href="/profile"
            className="flex items-center gap-3 px-6 py-2 text-[13px] text-muted hover:bg-gray-100 hover:text-foreground"
          >
            <User className="h-4 w-4" />
            <span>โปรไฟล์ของฉัน</span>
          </Link>
          <Link
            href="/account-settings"
            className="flex items-center gap-3 px-6 py-2 text-[13px] text-muted hover:bg-gray-100 hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            <span>ตั้งค่าบัญชีผู้ใช้งาน</span>
          </Link>
          <Link
            href="/my-issues"
            className="flex items-center gap-3 px-6 py-2 text-[13px] text-muted hover:bg-gray-100 hover:text-foreground"
          >
            <LifeBuoy className="h-4 w-4" />
            <span>รายการแจ้งปัญหา</span>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-6 py-2 text-left text-[13px] text-muted hover:bg-gray-100 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span>ออกจากระบบ</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
