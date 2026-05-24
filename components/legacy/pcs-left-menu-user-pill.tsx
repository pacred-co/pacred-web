"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
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
}: {
  userID: string;
  userPicture: string;
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
          className="h-10 w-10 rounded-full object-cover"
        />
        <span className="text-sm font-semibold text-foreground">{userID}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform ${
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
