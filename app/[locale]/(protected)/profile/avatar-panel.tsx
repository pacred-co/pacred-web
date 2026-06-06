"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { uploadAvatar } from "@/lib/storage-upload";
import { updateAvatar } from "@/actions/profile";
import { StyledFileInput } from "@/components/ui/styled-file-input";

type Props = {
  currentAvatarUrl: string | null;
  fallbackInitial: string;
};

export function AvatarPanel({ currentAvatarUrl, fallbackInitial }: Props) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const up = await uploadAvatar(file);
      if (!up.ok) {
        setError(up.error);
        return;
      }
      const save = await updateAvatar(up.publicUrl);
      if (!save.ok) {
        setError(save.error);
        return;
      }
      setPreviewUrl(up.publicUrl);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-bold text-foreground mb-4">{t("sectionAvatar")}</h2>
      <div className="flex items-center gap-5">
        <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-border bg-surface-alt flex items-center justify-center shrink-0">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="avatar"
              fill
              sizes="96px"
              className="object-cover"
              unoptimized                 // public URL with cache-busting query string
            />
          ) : (
            <span className="text-3xl font-bold text-muted">{fallbackInitial}</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <span className="block text-sm font-medium mb-1">{t("avatarChange")}</span>
            <StyledFileInput
              accept="image/*"
              onChange={onPick}
              disabled={pending}
              label="อัปโหลดรูปโปรไฟล์"
              hint={t("avatarHint")}
            />
          </div>
          {error   && <p className="text-xs text-red-700">{error}</p>}
          {success && <p className="text-xs text-green-700">{t("avatarUpdated")}</p>}
        </div>
      </div>
    </div>
  );
}
