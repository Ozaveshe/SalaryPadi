begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, community, security, audit;
select plan(24);

select ok(
  to_regclass('community.member_profiles') is not null
  and to_regclass('community.feed_posts') is not null
  and to_regclass('community.forum_topics') is not null
  and to_regclass('community.forum_threads') is not null
  and to_regclass('community.forum_replies') is not null,
  'community tables exist outside the exposed api schema'
);

select ok(
  not has_table_privilege('anon', 'community.feed_posts', 'SELECT')
  and not has_table_privilege('authenticated', 'community.feed_posts', 'INSERT')
  and not has_table_privilege('authenticated', 'community.member_profiles', 'SELECT'),
  'application roles have no direct community table access'
);

select ok(
  has_function_privilege('anon', 'api.list_feed_posts(text,text,integer)', 'EXECUTE')
  and has_function_privilege('anon', 'api.list_forum_topics()', 'EXECUTE')
  and not has_function_privilege('anon', 'api.publish_feed_post(text,text,text,text)', 'EXECUTE'),
  'anonymous users can read community content but cannot publish it'
);

select ok(
  has_function_privilege('authenticated', 'api.publish_feed_post(text,text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'api.publish_forum_thread(text,text,text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'api.publish_forum_reply(text,text,uuid,text)', 'EXECUTE'),
  'authenticated users can execute the constrained publishing RPCs'
);

select ok(
  (select bool_and(not p.prosecdef)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api'
     and p.proname in (
       'list_feed_posts', 'publish_feed_post', 'list_forum_topics',
       'list_forum_threads', 'publish_forum_thread', 'publish_forum_reply'
     )),
  'community api wrappers are security invoker functions'
);

set local role anon;
select is(
  (select count(*)::integer from api.list_nigeria_states()),
  37,
  'the public state list contains all Nigerian states and the FCT'
);
select is(
  (select count(*)::integer from api.list_forum_topics()),
  5,
  'the forum starts with five focused discussion topics'
);
reset role;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('ca000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'community-a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('cb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'community-b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ca000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select api.publish_feed_post(
    'Ada Career', 'LA', 'career_update',
    'I completed a cloud certification and documented the project lessons.'
  ) $$,
  'an active permanent account can publish a feed post'
);
select is(
  (select display_name from api.get_my_community_profile()),
  'Ada Career',
  'publishing creates the private account-to-community profile mapping'
);
select is(
  (select count(*)::integer
   from api.list_feed_posts('career_update', 'LA', 30)
   where body like 'I completed a cloud certification%'
     and is_mine),
  1,
  'the author sees the published feed post and ownership marker'
);
select throws_ok(
  $$ select api.publish_feed_post(
    'Ada Career', 'LA', 'question',
    'Please contact me at private@example.test about this role.'
  ) $$,
  '22023', null,
  'public feed posts reject email addresses'
);
select throws_ok(
  $$ select api.publish_feed_post(
    'Ada Career', 'XX', 'question',
    'What portfolio evidence helps for a first engineering role?'
  ) $$,
  '22023', null,
  'publishing rejects an unknown Nigerian state code'
);

select lives_ok(
  $$ select api.publish_forum_thread(
    'Ada Career', 'LA', 'career-growth',
    'Building evidence for a promotion',
    'What examples have helped you show promotion readiness beyond your daily task list?'
  ) $$,
  'an authenticated member can start a forum thread'
);
select is(
  (select count(*)::integer
   from api.list_forum_threads('career-growth', 30)
   where title = 'Building evidence for a promotion'
     and is_mine),
  1,
  'the new forum thread appears in its topic with an ownership marker'
);
select lives_ok(
  $$ select api.publish_forum_reply(
    'Ada Career', 'LA',
    (select id from api.list_forum_threads('career-growth', 30)
     where title = 'Building evidence for a promotion'),
    'I keep a monthly impact log with the result, evidence and collaborators.'
  ) $$,
  'the thread author can add a reply'
);
select is(
  (select reply_count::integer
   from api.list_forum_threads('career-growth', 30)
   where title = 'Building evidence for a promotion'),
  1,
  'forum thread summaries count published replies once'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'cb000000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select is(
  api.remove_my_community_content(
    'feed_post',
    (select id from api.list_feed_posts('career_update', 'LA', 30)
     where body like 'I completed a cloud certification%')
  ),
  false,
  'another account cannot remove the author feed post'
);
select is(
  (select is_mine
   from api.list_forum_threads('career-growth', 30)
   where title = 'Building evidence for a promotion'),
  false,
  'another account does not receive the thread ownership marker'
);
select lives_ok(
  $$ select api.submit_report(
    'forum_thread',
    (select id::text from api.list_forum_threads('career-growth', 30)
     where title = 'Building evidence for a promotion'),
    'privacy',
    'Please review this discussion for personal information.'
  ) $$,
  'community content can enter the existing moderation report workflow'
);

reset role;
select is(
  (select target_kind::text from private.reports
   where reporter_user_id = 'cb000000-0000-0000-0000-000000000002'
   order by created_at desc limit 1),
  'forum_thread',
  'the moderation case stores the community target kind'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ca000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select is(
  api.remove_my_community_content(
    'feed_post',
    (select id from api.list_feed_posts('career_update', 'LA', 30)
     where body like 'I completed a cloud certification%')
  ),
  true,
  'the author can remove their feed post'
);
select is(
  (select count(*)::integer
   from api.list_feed_posts('career_update', 'LA', 30)
   where body like 'I completed a cloud certification%'),
  0,
  'removed feed posts disappear from public reads'
);
select is(
  api.remove_my_community_content(
    'forum_reply',
    (select id from api.list_forum_replies(
      (select id from api.list_forum_threads('career-growth', 30)
       where title = 'Building evidence for a promotion'),
      100
    ) where body like 'I keep a monthly impact log%')
  ),
  true,
  'the reply author can remove their reply'
);
select is(
  (select reply_count::integer
   from api.list_forum_threads('career-growth', 30)
   where title = 'Building evidence for a promotion'),
  0,
  'removed replies no longer contribute to public reply counts'
);

select * from finish();
rollback;
