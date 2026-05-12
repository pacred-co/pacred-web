-- ════════════════════════════════════════════════════════════
-- Phase B5+ — Avatar uploads bucket
-- ════════════════════════════════════════════════════════════
-- Profile.avatar_url already exists (from 0003). This adds the
-- 'avatars' bucket (public read so <img> tags don't need signed URLs)
-- with owner-only write.
-- ════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)                              -- public read
on conflict (id) do nothing;

-- Path pattern: avatars/{user_id}/{filename}

-- Public read is implicit on a public bucket; we still want to gate writes.
drop policy if exists "avatars_user_insert" on storage.objects;
create policy "avatars_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_user_update" on storage.objects;
create policy "avatars_user_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_user_delete" on storage.objects;
create policy "avatars_user_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
