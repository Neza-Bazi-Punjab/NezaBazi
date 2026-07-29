-- Optional rider headshots.
--
-- A rider may attach a photo when registering solo, and can replace it later
-- from their account page. The photo belongs to the person rather than to a
-- registration, so the storage path is kept in Auth user metadata alongside
-- name, age, location and phone — the same place the rest of the account
-- lives.
--
-- The bucket is private. A rider uploading a headshot to enter a competition
-- has not agreed to it being served from a permanent public URL, and a public
-- object URL cannot be withdrawn once it has been shared. Everything that
-- displays a headshot mints a short-lived signed URL instead.

-- The browser rotates, downscales and re-encodes every photo to JPEG before
-- uploading, so the bucket only ever receives one format and never sees the
-- 8-12 MB original a phone camera produces. The limit here is a backstop
-- against anything that bypasses that path, not the working constraint.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rider-headshots',
  'rider-headshots',
  false,
  2097152, -- 2 MB; a 1200px JPEG at 0.85 lands far below this
  array['image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored as `<profile_id>/<filename>`, so the first path segment
-- is the owner. Every policy below pins on that, which means a rider can only
-- ever touch their own folder no matter what path the browser asks for.

drop policy if exists "Riders read their own headshot" on storage.objects;
create policy "Riders read their own headshot"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'rider-headshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Riders upload their own headshot" on storage.objects;
create policy "Riders upload their own headshot"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'rider-headshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Riders replace their own headshot" on storage.objects;
create policy "Riders replace their own headshot"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'rider-headshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'rider-headshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Riders delete their own headshot" on storage.objects;
create policy "Riders delete their own headshot"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'rider-headshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Administrators read every headshot: the check-in desk is the one place the
-- photo has to be seen by someone other than its owner, to confirm that the
-- rider presenting a code is the rider it was issued to. Read only — no admin
-- policy grants insert, update or delete, so a headshot can only ever be
-- changed by the person it belongs to.
drop policy if exists "Admins read every headshot" on storage.objects;
create policy "Admins read every headshot"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'rider-headshots' and public.is_admin());
