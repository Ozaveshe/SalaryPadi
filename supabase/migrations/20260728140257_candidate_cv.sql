begin;

-- Candidate CV storage.
--
-- The document itself is the account owner's own record of their own history.
-- Nothing read out of it is ever published, shown to an employer, or treated as
-- verified: the extracted text exists so the owner can see exactly what was
-- read, and so a re-match never has to re-read the file. Everything the parser
-- proposes reaches the profile only after the owner saves it themselves, which
-- is what `private.candidate_profiles.attested_at` already records.
--
-- The bucket is private. A CV is readable only through a short-lived signed URL
-- minted for its owner, never by public path.

-- The bucket and its object policies are guarded on the Storage extension
-- being installed. The migration chain is replayed in CI against a bare
-- Postgres with pgTAP and no Storage, where `storage.buckets` does not exist;
-- an unguarded reference stops the whole replay at this file. Everything below
-- the guard is ordinary schema and runs either way, so the tables, functions
-- and grants stay under test even where the bucket cannot exist.
do $storage$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage extension absent: skipping candidate-cv bucket and object policies.';
    return;
  end if;

  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'candidate-cv',
      'candidate-cv',
      false,
      5242880,
      array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ]
    )
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types
  $sql$;

  -- The first path segment is the owner's id, so a signed-in account reaches
  -- its own objects and nothing else.
  execute $sql$drop policy if exists candidate_cv_owner_read on storage.objects$sql$;
  execute $sql$
    create policy candidate_cv_owner_read on storage.objects
    for select to authenticated
    using (
      bucket_id = 'candidate-cv'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select security.is_active_user())
    )
  $sql$;

  execute $sql$drop policy if exists candidate_cv_owner_insert on storage.objects$sql$;
  execute $sql$
    create policy candidate_cv_owner_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'candidate-cv'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select security.is_active_user())
    )
  $sql$;

  execute $sql$drop policy if exists candidate_cv_owner_delete on storage.objects$sql$;
  execute $sql$
    create policy candidate_cv_owner_delete on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'candidate-cv'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select security.is_active_user())
    )
  $sql$;
end
$storage$;

create table if not exists private.candidate_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  -- Always '<user_id>/<uuid>.<ext>'. The storage policies below depend on the
  -- first path segment being the owner, so the segment is constrained here too.
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  byte_size integer not null,
  -- What the parser actually read. Null when the document could not be read at
  -- all, which is a stated outcome rather than an empty CV.
  extracted_text text,
  parse_state text not null default 'unreadable',
  parse_note text,
  is_current boolean not null default true,
  uploaded_at timestamptz not null default now(),
  constraint candidate_cv_path_owned check (
    storage_path like (user_id::text || '/%')
  ),
  constraint candidate_cv_file_name_length check (
    char_length(file_name) between 1 and 260
  ),
  constraint candidate_cv_content_type check (
    content_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    )
  ),
  constraint candidate_cv_size_range check (byte_size between 1 and 5242880),
  constraint candidate_cv_parse_state check (
    parse_state in ('parsed', 'unreadable')
  ),
  constraint candidate_cv_text_size check (
    extracted_text is null or char_length(extracted_text) <= 200000
  ),
  -- A document that could not be read must say so rather than present as an
  -- empty but successful parse.
  constraint candidate_cv_parsed_has_text check (
    parse_state <> 'parsed' or nullif(btrim(coalesce(extracted_text, '')), '') is not null
  ),
  constraint candidate_cv_note_length check (
    parse_note is null or char_length(parse_note) <= 500
  )
);

-- Exactly one CV is the current one; the rest are kept until the owner deletes
-- them, because an application may still point at the version that was sent.
create unique index if not exists candidate_cvs_one_current
  on private.candidate_cvs (user_id)
  where is_current;

create index if not exists candidate_cvs_owner_recent
  on private.candidate_cvs (user_id, uploaded_at desc);

alter table private.candidate_cvs enable row level security;
alter table private.candidate_cvs force row level security;

drop policy if exists candidate_cvs_owner_all on private.candidate_cvs;
create policy candidate_cvs_owner_all on private.candidate_cvs
for all to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()))
with check (user_id = (select auth.uid()) and (select security.is_active_user()));

-- The CV that was actually sent for a given application. `on delete set null`
-- rather than cascade: deleting a document must never delete the record that a
-- process happened.
alter table private.applications
  add column if not exists cv_id uuid
  references private.candidate_cvs(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Owner-scoped access
-- ---------------------------------------------------------------------------

create or replace function security.record_my_cv(cv_payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_path text;
begin
  if not (select security.is_active_user()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if cv_payload is null or jsonb_typeof(cv_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_path := cv_payload ->> 'storage_path';
  -- The route uploads under the caller's own prefix; refuse to record anything
  -- else even if the upload somehow succeeded.
  if v_path is null or v_path not like (v_user_id::text || '/%') then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  update private.candidate_cvs
  set is_current = false
  where user_id = v_user_id and is_current;

  insert into private.candidate_cvs (
    user_id, storage_path, file_name, content_type, byte_size,
    extracted_text, parse_state, parse_note, is_current
  )
  values (
    v_user_id,
    v_path,
    cv_payload ->> 'file_name',
    cv_payload ->> 'content_type',
    (cv_payload ->> 'byte_size')::integer,
    nullif(btrim(coalesce(cv_payload ->> 'extracted_text', '')), ''),
    coalesce(cv_payload ->> 'parse_state', 'unreadable'),
    nullif(btrim(coalesce(cv_payload ->> 'parse_note', '')), ''),
    true
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function security.get_my_cvs()
returns table (
  id uuid,
  storage_path text,
  file_name text,
  content_type text,
  byte_size integer,
  extracted_text text,
  parse_state text,
  parse_note text,
  is_current boolean,
  uploaded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select
    c.id, c.storage_path, c.file_name, c.content_type, c.byte_size,
    c.extracted_text, c.parse_state, c.parse_note, c.is_current, c.uploaded_at
  from private.candidate_cvs c
  where c.user_id = (select auth.uid())
  order by c.uploaded_at desc
  limit 25;
end;
$$;

-- Returns the storage path of the removed row so the caller can delete the
-- object it points at. A row is never removed without naming what is now
-- orphaned.
create or replace function security.delete_my_cv(p_cv_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_path text;
  v_was_current boolean;
begin
  if not (select security.is_active_user()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from private.candidate_cvs c
  where c.id = p_cv_id and c.user_id = v_user_id
  returning c.storage_path, c.is_current into v_path, v_was_current;

  if v_path is null then return null; end if;

  -- Removing the current CV promotes the most recent survivor rather than
  -- leaving the account with documents but no current one.
  if v_was_current then
    update private.candidate_cvs c
    set is_current = true
    where c.id = (
      select c2.id
      from private.candidate_cvs c2
      where c2.user_id = v_user_id
      order by c2.uploaded_at desc
      limit 1
    );
  end if;

  return v_path;
end;
$$;

create or replace function security.attach_cv_to_my_application(
  p_application_id uuid,
  p_cv_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_updated boolean := false;
begin
  if not (select security.is_active_user()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Clearing the attachment is a valid outcome, so a null cv id is accepted;
  -- a non-null one must belong to the same account.
  if p_cv_id is not null and not exists (
    select 1 from private.candidate_cvs c
    where c.id = p_cv_id and c.user_id = v_user_id
  ) then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  update private.applications a
  set cv_id = p_cv_id, updated_at = now()
  where a.id = p_application_id and a.user_id = v_user_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function api.get_my_cvs()
returns table (
  id uuid,
  storage_path text,
  file_name text,
  content_type text,
  byte_size integer,
  extracted_text text,
  parse_state text,
  parse_note text,
  is_current boolean,
  uploaded_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from security.get_my_cvs() $$;

create or replace function api.record_my_cv(cv_payload jsonb)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select security.record_my_cv(cv_payload) $$;

create or replace function api.delete_my_cv(p_cv_id uuid)
returns text
language sql volatile security invoker set search_path = ''
as $$ select security.delete_my_cv(p_cv_id) $$;

create or replace function api.attach_cv_to_my_application(
  p_application_id uuid,
  p_cv_id uuid
)
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select security.attach_cv_to_my_application(p_application_id, p_cv_id) $$;

revoke all on function security.record_my_cv(jsonb) from public, anon, authenticated;
revoke all on function security.get_my_cvs() from public, anon, authenticated;
revoke all on function security.delete_my_cv(uuid) from public, anon, authenticated;
revoke all on function security.attach_cv_to_my_application(uuid, uuid) from public, anon, authenticated;
revoke all on function api.record_my_cv(jsonb) from public, anon, authenticated;
revoke all on function api.get_my_cvs() from public, anon, authenticated;
revoke all on function api.delete_my_cv(uuid) from public, anon, authenticated;
revoke all on function api.attach_cv_to_my_application(uuid, uuid) from public, anon, authenticated;

grant execute on function security.record_my_cv(jsonb) to authenticated;
grant execute on function security.get_my_cvs() to authenticated;
grant execute on function security.delete_my_cv(uuid) to authenticated;
grant execute on function security.attach_cv_to_my_application(uuid, uuid) to authenticated;

grant execute on function api.record_my_cv(jsonb) to authenticated;
grant execute on function api.get_my_cvs() to authenticated;
grant execute on function api.delete_my_cv(uuid) to authenticated;
grant execute on function api.attach_cv_to_my_application(uuid, uuid) to authenticated;

commit;
