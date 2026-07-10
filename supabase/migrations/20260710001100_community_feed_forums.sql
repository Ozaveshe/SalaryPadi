begin;

alter type private.report_target_kind add value if not exists 'feed_post';
alter type private.report_target_kind add value if not exists 'forum_thread';
alter type private.report_target_kind add value if not exists 'forum_reply';

create schema if not exists community;
revoke all on schema community from public, anon, authenticated;

create table community.nigeria_states (
  code text primary key,
  name text not null unique,
  sort_order integer not null,
  constraint nigeria_states_code check (code ~ '^[A-Z]{2,4}$'),
  constraint nigeria_states_name check (char_length(name) between 3 and 40),
  constraint nigeria_states_sort_order check (sort_order between 1 and 50)
);

insert into community.nigeria_states (code, name, sort_order)
values
  ('AB', 'Abia', 1), ('AD', 'Adamawa', 2), ('AK', 'Akwa Ibom', 3),
  ('AN', 'Anambra', 4), ('BA', 'Bauchi', 5), ('BY', 'Bayelsa', 6),
  ('BE', 'Benue', 7), ('BO', 'Borno', 8), ('CR', 'Cross River', 9),
  ('DE', 'Delta', 10), ('EB', 'Ebonyi', 11), ('ED', 'Edo', 12),
  ('EK', 'Ekiti', 13), ('EN', 'Enugu', 14), ('FC', 'Federal Capital Territory', 15),
  ('GO', 'Gombe', 16), ('IM', 'Imo', 17), ('JI', 'Jigawa', 18),
  ('KD', 'Kaduna', 19), ('KN', 'Kano', 20), ('KT', 'Katsina', 21),
  ('KE', 'Kebbi', 22), ('KO', 'Kogi', 23), ('KW', 'Kwara', 24),
  ('LA', 'Lagos', 25), ('NA', 'Nasarawa', 26), ('NI', 'Niger', 27),
  ('OG', 'Ogun', 28), ('ON', 'Ondo', 29), ('OS', 'Osun', 30),
  ('OY', 'Oyo', 31), ('PL', 'Plateau', 32), ('RI', 'Rivers', 33),
  ('SO', 'Sokoto', 34), ('TA', 'Taraba', 35), ('YO', 'Yobe', 36),
  ('ZA', 'Zamfara', 37)
on conflict (code) do update
set name = excluded.name, sort_order = excluded.sort_order;

create table community.member_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references private.profiles(user_id) on delete cascade,
  handle text not null unique default ('sp-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  display_name text not null,
  state_code text references community.nigeria_states(code) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_member_handle check (handle ~ '^sp-[a-f0-9]{8}$'),
  constraint community_member_display_name check (char_length(btrim(display_name)) between 2 and 60),
  constraint community_member_status check (status in ('active', 'suspended'))
);

create table community.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_profile_id uuid not null references community.member_profiles(id) on delete cascade,
  category text not null,
  state_code text references community.nigeria_states(code) on delete set null,
  body text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint feed_post_category check (
    category in ('career_update', 'opportunity', 'question', 'event', 'announcement')
  ),
  constraint feed_post_body check (char_length(btrim(body)) between 10 and 2000),
  constraint feed_post_status check (status in ('published', 'removed')),
  constraint feed_post_removed_pair check (
    (status = 'published' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create index feed_posts_public_order
on community.feed_posts (created_at desc)
where status = 'published';

create index feed_posts_public_filters
on community.feed_posts (category, state_code, created_at desc)
where status = 'published';

create table community.forum_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  sort_order integer not null,
  status text not null default 'active',
  constraint forum_topic_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint forum_topic_name check (char_length(name) between 3 and 80),
  constraint forum_topic_description check (char_length(description) between 10 and 240),
  constraint forum_topic_status check (status in ('active', 'archived'))
);

insert into community.forum_topics (slug, name, description, sort_order)
values
  ('career-growth', 'Career growth', 'Skills, promotions, portfolio building and practical career development.', 1),
  ('applications-interviews', 'Applications and interviews', 'CVs, applications, interviews, assessments and recruiter conversations.', 2),
  ('pay-benefits', 'Pay and benefits', 'Salary, benefits, negotiation and understanding the full value of an offer.', 3),
  ('remote-work', 'Remote work', 'Remote opportunities, cross-border work, equipment and distributed-team practices.', 4),
  ('workplace-life', 'Workplace life', 'Culture, management, wellbeing and navigating everyday work situations.', 5)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

create table community.forum_threads (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references community.forum_topics(id) on delete restrict,
  author_profile_id uuid not null references community.member_profiles(id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'published',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint forum_thread_title check (char_length(btrim(title)) between 8 and 160),
  constraint forum_thread_body check (char_length(btrim(body)) between 20 and 5000),
  constraint forum_thread_status check (status in ('published', 'removed')),
  constraint forum_thread_removed_pair check (
    (status = 'published' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create index forum_threads_public_order
on community.forum_threads (topic_id, created_at desc)
where status = 'published';

create table community.forum_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references community.forum_threads(id) on delete cascade,
  author_profile_id uuid not null references community.member_profiles(id) on delete cascade,
  body text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint forum_reply_body check (char_length(btrim(body)) between 2 and 3000),
  constraint forum_reply_status check (status in ('published', 'removed')),
  constraint forum_reply_removed_pair check (
    (status = 'published' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create index forum_replies_public_order
on community.forum_replies (thread_id, created_at)
where status = 'published';

alter table community.nigeria_states enable row level security;
alter table community.nigeria_states force row level security;
alter table community.member_profiles enable row level security;
alter table community.member_profiles force row level security;
alter table community.feed_posts enable row level security;
alter table community.feed_posts force row level security;
alter table community.forum_topics enable row level security;
alter table community.forum_topics force row level security;
alter table community.forum_threads enable row level security;
alter table community.forum_threads force row level security;
alter table community.forum_replies enable row level security;
alter table community.forum_replies force row level security;

revoke all on all tables in schema community from public, anon, authenticated;

create or replace function security.community_text_is_safe(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_value is not null
    and p_value !~* '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}'
    and p_value !~ '[+0-9][0-9 ()+\.\-]{7,}'
$$;

create or replace function security.upsert_community_member(
  p_display_name text,
  p_state_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_state text := upper(nullif(btrim(coalesce(p_state_code, '')), ''));
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if char_length(v_name) not between 2 and 60
     or not (select security.community_text_is_safe(v_name)) then
    raise exception using errcode = '22023', message = 'invalid public display name';
  end if;
  if v_state is not null and not exists (
    select 1 from community.nigeria_states s where s.code = v_state
  ) then
    raise exception using errcode = '22023', message = 'invalid Nigerian state';
  end if;

  insert into community.member_profiles (user_id, display_name, state_code)
  values ((select auth.uid()), v_name, v_state)
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      state_code = excluded.state_code,
      updated_at = clock_timestamp()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function security.publish_feed_post(
  p_display_name text,
  p_state_code text,
  p_category text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_member uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_category text := lower(btrim(coalesce(p_category, '')));
begin
  if v_category not in ('career_update', 'opportunity', 'question', 'event', 'announcement')
     or char_length(v_body) not between 10 and 2000
     or not (select security.community_text_is_safe(v_body)) then
    raise exception using errcode = '22023', message = 'invalid feed post';
  end if;

  perform security.consume_rate_limit('community_feed_post', 10, interval '1 day');
  v_member := security.upsert_community_member(p_display_name, p_state_code);

  insert into community.feed_posts (id, author_profile_id, category, state_code, body)
  select v_id, v_member, v_category, m.state_code, v_body
  from community.member_profiles m where m.id = v_member and m.status = 'active';

  if not found then
    raise exception using errcode = '42501', message = 'community profile unavailable';
  end if;

  perform audit.write_event(
    'user', 'community.feed_post.published', 'feed_post', v_id,
    null, null, jsonb_build_object('status', 'published'), array['status']
  );
  return v_id;
end;
$$;

create or replace function security.publish_forum_thread(
  p_display_name text,
  p_state_code text,
  p_topic_slug text,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_member uuid;
  v_topic uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  select id into v_topic
  from community.forum_topics
  where slug = lower(btrim(coalesce(p_topic_slug, ''))) and status = 'active';
  if v_topic is null
     or char_length(v_title) not between 8 and 160
     or char_length(v_body) not between 20 and 5000
     or not (select security.community_text_is_safe(v_title))
     or not (select security.community_text_is_safe(v_body)) then
    raise exception using errcode = '22023', message = 'invalid forum thread';
  end if;

  perform security.consume_rate_limit('community_forum_thread', 5, interval '1 day');
  v_member := security.upsert_community_member(p_display_name, p_state_code);

  insert into community.forum_threads (id, topic_id, author_profile_id, title, body)
  values (v_id, v_topic, v_member, v_title, v_body);

  perform audit.write_event(
    'user', 'community.forum_thread.published', 'forum_thread', v_id,
    null, null, jsonb_build_object('status', 'published'), array['status']
  );
  return v_id;
end;
$$;

create or replace function security.publish_forum_reply(
  p_display_name text,
  p_state_code text,
  p_thread_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_member uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 2 and 3000
     or not (select security.community_text_is_safe(v_body))
     or not exists (
       select 1 from community.forum_threads t
       where t.id = p_thread_id and t.status = 'published' and t.locked_at is null
     ) then
    raise exception using errcode = '22023', message = 'invalid forum reply';
  end if;

  perform security.consume_rate_limit('community_forum_reply', 20, interval '1 day');
  v_member := security.upsert_community_member(p_display_name, p_state_code);

  insert into community.forum_replies (id, thread_id, author_profile_id, body)
  values (v_id, p_thread_id, v_member, v_body);

  perform audit.write_event(
    'user', 'community.forum_reply.published', 'forum_reply', v_id,
    null, null, jsonb_build_object('status', 'published'), array['status']
  );
  return v_id;
end;
$$;

create or replace function security.remove_my_community_content(
  p_kind text,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_changed integer := 0;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  select id into v_member from community.member_profiles where user_id = (select auth.uid());
  if v_member is null then return false; end if;

  case p_kind
    when 'feed_post' then
      update community.feed_posts set status = 'removed', removed_at = clock_timestamp()
      where id = p_id and author_profile_id = v_member and status = 'published';
    when 'forum_thread' then
      update community.forum_threads set status = 'removed', removed_at = clock_timestamp()
      where id = p_id and author_profile_id = v_member and status = 'published';
    when 'forum_reply' then
      update community.forum_replies set status = 'removed', removed_at = clock_timestamp()
      where id = p_id and author_profile_id = v_member and status = 'published';
    else
      raise exception using errcode = '22023', message = 'invalid community content kind';
  end case;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    perform audit.write_event(
      'user', 'community.content.removed', p_kind, p_id,
      'author_removed', jsonb_build_object('status', 'published'),
      jsonb_build_object('status', 'removed'), array['status']
    );
  end if;
  return v_changed > 0;
end;
$$;

create or replace function security.list_nigeria_states()
returns table (code text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.code, s.name from community.nigeria_states s order by s.sort_order
$$;

create or replace function security.get_my_community_profile()
returns table (display_name text, handle text, state_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.display_name, m.handle, m.state_code
  from community.member_profiles m
  where m.user_id = (select auth.uid()) and m.status = 'active'
$$;

create or replace function security.list_feed_posts(
  p_category text default null,
  p_state_code text default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  author_name text,
  author_handle text,
  category text,
  state_code text,
  state_name text,
  body text,
  created_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, m.display_name, m.handle, p.category, p.state_code, s.name,
         p.body, p.created_at, coalesce(m.user_id = (select auth.uid()), false)
  from community.feed_posts p
  join community.member_profiles m on m.id = p.author_profile_id and m.status = 'active'
  left join community.nigeria_states s on s.code = p.state_code
  where p.status = 'published'
    and (nullif(p_category, '') is null or p.category = p_category)
    and (nullif(p_state_code, '') is null or p.state_code = upper(p_state_code))
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
$$;

create or replace function security.list_forum_topics()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  thread_count bigint,
  latest_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.name, t.description,
         count(distinct th.id), max(coalesce(r.created_at, th.created_at))
  from community.forum_topics t
  left join community.forum_threads th on th.topic_id = t.id and th.status = 'published'
  left join community.forum_replies r on r.thread_id = th.id and r.status = 'published'
  where t.status = 'active'
  group by t.id, t.slug, t.name, t.description, t.sort_order
  order by t.sort_order
$$;

create or replace function security.list_forum_threads(
  p_topic_slug text default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  topic_slug text,
  topic_name text,
  author_name text,
  author_handle text,
  title text,
  excerpt text,
  reply_count bigint,
  created_at timestamptz,
  latest_activity_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select th.id, tp.slug, tp.name, m.display_name, m.handle, th.title,
         left(th.body, 320), count(r.id), th.created_at,
         greatest(th.created_at, coalesce(max(r.created_at), th.created_at)) as latest_activity_at,
         coalesce(m.user_id = (select auth.uid()), false)
  from community.forum_threads th
  join community.forum_topics tp on tp.id = th.topic_id and tp.status = 'active'
  join community.member_profiles m on m.id = th.author_profile_id and m.status = 'active'
  left join community.forum_replies r on r.thread_id = th.id and r.status = 'published'
  where th.status = 'published'
    and (nullif(p_topic_slug, '') is null or tp.slug = p_topic_slug)
  group by th.id, tp.slug, tp.name, m.display_name, m.handle, m.user_id
  order by latest_activity_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
$$;

create or replace function security.get_forum_thread(p_thread_id uuid)
returns table (
  id uuid,
  topic_slug text,
  topic_name text,
  author_name text,
  author_handle text,
  title text,
  body text,
  created_at timestamptz,
  locked boolean,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select th.id, tp.slug, tp.name, m.display_name, m.handle, th.title, th.body,
         th.created_at, th.locked_at is not null,
         coalesce(m.user_id = (select auth.uid()), false)
  from community.forum_threads th
  join community.forum_topics tp on tp.id = th.topic_id and tp.status = 'active'
  join community.member_profiles m on m.id = th.author_profile_id and m.status = 'active'
  where th.id = p_thread_id and th.status = 'published'
$$;

create or replace function security.list_forum_replies(
  p_thread_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  author_name text,
  author_handle text,
  body text,
  created_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, m.display_name, m.handle, r.body, r.created_at,
         coalesce(m.user_id = (select auth.uid()), false)
  from community.forum_replies r
  join community.member_profiles m on m.id = r.author_profile_id and m.status = 'active'
  join community.forum_threads th on th.id = r.thread_id and th.status = 'published'
  where r.thread_id = p_thread_id and r.status = 'published'
  order by r.created_at
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
$$;

create or replace function api.list_nigeria_states()
returns table (code text, name text)
language sql stable security invoker set search_path = ''
as $$ select * from security.list_nigeria_states() $$;

create or replace function api.get_my_community_profile()
returns table (display_name text, handle text, state_code text)
language sql stable security invoker set search_path = ''
as $$ select * from security.get_my_community_profile() $$;

create or replace function api.list_feed_posts(
  category_filter text default null,
  state_filter text default null,
  page_limit integer default 30
)
returns table (
  id uuid, author_name text, author_handle text, category text,
  state_code text, state_name text, body text, created_at timestamptz, is_mine boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from security.list_feed_posts(category_filter, state_filter, page_limit) $$;

create or replace function api.publish_feed_post(
  display_name text,
  state_code text,
  post_category text,
  post_body text
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select security.publish_feed_post(display_name, state_code, post_category, post_body) $$;

create or replace function api.list_forum_topics()
returns table (
  id uuid, slug text, name text, description text,
  thread_count bigint, latest_activity_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from security.list_forum_topics() $$;

create or replace function api.list_forum_threads(
  topic_filter text default null,
  page_limit integer default 30
)
returns table (
  id uuid, topic_slug text, topic_name text, author_name text, author_handle text,
  title text, excerpt text, reply_count bigint, created_at timestamptz,
  latest_activity_at timestamptz, is_mine boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from security.list_forum_threads(topic_filter, page_limit) $$;

create or replace function api.get_forum_thread(thread_id uuid)
returns table (
  id uuid, topic_slug text, topic_name text, author_name text, author_handle text,
  title text, body text, created_at timestamptz, locked boolean, is_mine boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from security.get_forum_thread(thread_id) $$;

create or replace function api.list_forum_replies(thread_id uuid, page_limit integer default 100)
returns table (
  id uuid, author_name text, author_handle text, body text,
  created_at timestamptz, is_mine boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from security.list_forum_replies(thread_id, page_limit) $$;

create or replace function api.publish_forum_thread(
  display_name text,
  state_code text,
  topic_slug text,
  thread_title text,
  thread_body text
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select security.publish_forum_thread(display_name, state_code, topic_slug, thread_title, thread_body) $$;

create or replace function api.publish_forum_reply(
  display_name text,
  state_code text,
  thread_id uuid,
  reply_body text
)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select security.publish_forum_reply(display_name, state_code, thread_id, reply_body) $$;

create or replace function api.remove_my_community_content(content_kind text, content_id uuid)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select security.remove_my_community_content(content_kind, content_id) $$;

revoke all on function security.community_text_is_safe(text) from public, anon, authenticated;
revoke all on function security.upsert_community_member(text, text) from public, anon, authenticated;
revoke all on function security.publish_feed_post(text, text, text, text) from public, anon, authenticated;
revoke all on function security.publish_forum_thread(text, text, text, text, text) from public, anon, authenticated;
revoke all on function security.publish_forum_reply(text, text, uuid, text) from public, anon, authenticated;
revoke all on function security.remove_my_community_content(text, uuid) from public, anon, authenticated;
revoke all on function security.list_nigeria_states() from public, anon, authenticated;
revoke all on function security.get_my_community_profile() from public, anon, authenticated;
revoke all on function security.list_feed_posts(text, text, integer) from public, anon, authenticated;
revoke all on function security.list_forum_topics() from public, anon, authenticated;
revoke all on function security.list_forum_threads(text, integer) from public, anon, authenticated;
revoke all on function security.get_forum_thread(uuid) from public, anon, authenticated;
revoke all on function security.list_forum_replies(uuid, integer) from public, anon, authenticated;

grant execute on function security.list_nigeria_states() to anon, authenticated;
grant execute on function security.list_feed_posts(text, text, integer) to anon, authenticated;
grant execute on function security.list_forum_topics() to anon, authenticated;
grant execute on function security.list_forum_threads(text, integer) to anon, authenticated;
grant execute on function security.get_forum_thread(uuid) to anon, authenticated;
grant execute on function security.list_forum_replies(uuid, integer) to anon, authenticated;
grant execute on function security.get_my_community_profile() to authenticated;
grant execute on function security.publish_feed_post(text, text, text, text) to authenticated;
grant execute on function security.publish_forum_thread(text, text, text, text, text) to authenticated;
grant execute on function security.publish_forum_reply(text, text, uuid, text) to authenticated;
grant execute on function security.remove_my_community_content(text, uuid) to authenticated;

revoke all on function api.list_nigeria_states() from public;
revoke all on function api.get_my_community_profile() from public;
revoke all on function api.list_feed_posts(text, text, integer) from public;
revoke all on function api.publish_feed_post(text, text, text, text) from public;
revoke all on function api.list_forum_topics() from public;
revoke all on function api.list_forum_threads(text, integer) from public;
revoke all on function api.get_forum_thread(uuid) from public;
revoke all on function api.list_forum_replies(uuid, integer) from public;
revoke all on function api.publish_forum_thread(text, text, text, text, text) from public;
revoke all on function api.publish_forum_reply(text, text, uuid, text) from public;
revoke all on function api.remove_my_community_content(text, uuid) from public;

grant usage on schema api to anon, authenticated;
grant execute on function api.list_nigeria_states() to anon, authenticated;
grant execute on function api.list_feed_posts(text, text, integer) to anon, authenticated;
grant execute on function api.list_forum_topics() to anon, authenticated;
grant execute on function api.list_forum_threads(text, integer) to anon, authenticated;
grant execute on function api.get_forum_thread(uuid) to anon, authenticated;
grant execute on function api.list_forum_replies(uuid, integer) to anon, authenticated;
grant execute on function api.get_my_community_profile() to authenticated;
grant execute on function api.publish_feed_post(text, text, text, text) to authenticated;
grant execute on function api.publish_forum_thread(text, text, text, text, text) to authenticated;
grant execute on function api.publish_forum_reply(text, text, uuid, text) to authenticated;
grant execute on function api.remove_my_community_content(text, uuid) to authenticated;

commit;
