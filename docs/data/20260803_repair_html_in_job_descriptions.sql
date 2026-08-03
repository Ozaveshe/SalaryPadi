-- Repair job descriptions that stored their provider's markup as visible text.
--
-- APPLIED TO PRODUCTION 2026-08-03. 267 rows rewritten.
--
-- Why: `htmlToPlainText` stripped tags and then decoded entities. Greenhouse
-- and Lever send `content` HTML-escaped, so a single strip pass found no tags
-- to remove and the decode then turned `&lt;h3&gt;` into a literal `<h3>`.
-- Readers saw the tags. 267 of 1,882 descriptions were affected, and the One
-- Acre Fund Chief of Staff posting is the one that surfaced it.
--
-- The durable fix is in src/lib/jobs/normalize.ts, which now re-strips while a
-- decode keeps revealing recognisable HTML elements. This script only repairs
-- rows already stored; without it they would carry the damage until each
-- source's next successful import rewrote them.
--
-- This mirrors that function for the corruption actually present rather than
-- reimplementing it in general: the entity set in the affected rows is exactly
-- &nbsp; &amp; &lt; &gt;, measured before writing this.
--
-- Verified before applying, across all 267 rows:
--   * 0 still contain a tag or an entity afterwards
--   * 0 are emptied; the shortest result is 1,976 characters
--   * the 8 rows that lose more than half their length are markup-heavy Lever
--     postings whose prose is intact
--
-- Note on side effects: app.jobs carries a Google indexing outbox trigger, so
-- rewriting a description of an indexable job enqueues a URL_UPDATED row. That
-- is the correct signal — the public page genuinely changed — and 130 of the
-- 267 are eligible. The outbox had 2,962 rows pending and none ever delivered
-- at the time of writing, so nothing was sent as a result of this script.

update app.jobs
set description_text = btrim(regexp_replace(
  regexp_replace(
    replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(description_text, '<li\s[^>]*>|<li>', E'\n- ', 'gi'),
          '<br\s*/?>|</(p|div|li|h[1-6]|section|article|tr)>', E'\n', 'gi'),
        '</(ul|ol)>', E'\n\n', 'gi'),
      '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'),
    '<[^<>]{1,200}>', '', 'g'),
  E'\n{3,}', E'\n\n', 'g'))
where description_text like '%<%>%'
   or description_text like '%&nbsp;%'
   or description_text like '%&amp;%';
