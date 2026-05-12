"use client";

import { Bell, Search } from "lucide-react";
import type { AdminProfile } from "@/lib/auth/require-admin";

type Props = {
  profile: AdminProfile;
  sidebarWidth?: string;
};

export function AdminNavbar({ profile, sidebarWidth = "240px" }: Props) {
  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    profile.email ||
    "Admin";

  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <header
      className="fixed top-0 right-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-white dark:bg-surface px-6 transition-[left] duration-200"
      style={{ left: sidebarWidth }}
    >
      {/* Search */}
      <div className="flex flex-1 items-center gap-2 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="search"
            placeholder="ค้นหา..."
            className="w-full h-9 rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Notification bell */}
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface dark:hover:bg-surface-alt hover:text-foreground transition-colors"
          aria-label="การแจ้งเตือน"
        >
          <Bell className="h-4.5 w-4.5" />
          {/* Badge */}
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary-600" />
        </button>

        {/* User chip */}
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium text-foreground truncate max-w-[120px]">
              {displayName}
            </p>
            <p className="text-[11px] text-primary-600 font-semibold">Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
