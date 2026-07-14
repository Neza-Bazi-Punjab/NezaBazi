-- Registration drafts: server-side autosave for the solo form and the team
-- registration wizard, so a signed-in user can leave mid-registration and
-- resume later from any device. One draft per user per registration type.
-- Applied to the live project as migration `registration_drafts_autosave`.
create table public.registration_drafts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  draft_type text not null check (draft_type in ('solo', 'team')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, draft_type),
  -- Drafts hold form field text only; cap the payload so the column can't be
  -- abused as arbitrary storage.
  constraint registration_drafts_data_size_cap check (pg_column_size(data) <= 20000)
);

alter table public.registration_drafts enable row level security;

-- New Supabase projects no longer expose public-schema tables to the Data API
-- automatically. Make the intended API surface explicit: signed-in users can
-- manage drafts, while anonymous visitors cannot access the table at all.
revoke all on table public.registration_drafts from anon;
grant select, insert, update, delete on table public.registration_drafts to authenticated;

create policy "Users can view their own drafts"
  on public.registration_drafts for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "Users can create their own drafts"
  on public.registration_drafts for insert
  to authenticated
  with check ((select auth.uid()) = profile_id);

create policy "Users can update their own drafts"
  on public.registration_drafts for update
  to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy "Users can delete their own drafts"
  on public.registration_drafts for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

-- Keep updated_at accurate on every save without trusting client clocks.
create function public.set_registration_draft_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger registration_drafts_set_updated_at
  before update on public.registration_drafts
  for each row execute function public.set_registration_draft_updated_at();

-- Trigger-only function: match the project's convention of revoking direct
-- client execution (triggers still fire fine without EXECUTE).
revoke execute on function public.set_registration_draft_updated_at() from public, anon, authenticated;
