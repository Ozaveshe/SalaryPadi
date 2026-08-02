-- Backfill application_destination_kind across existing canonical jobs.
--
-- Read-and-classify only: this asserts nothing that is not already implied by
-- the destination host and the employer's own verified domains. Jobs whose
-- host matches no verified employer domain, no known ATS and no known
-- aggregator are classified 'external_board' — deliberately conservative,
-- because under-claiming is correct when the evidence for a stronger claim is
-- absent.
--
-- APPLIED TO PRODUCTION 2026-08-01. Result: 1,820 employer_ats, 55
-- external_board, 0 aggregator, 0 unclassified.
--
-- Known conservative outcome: the 55 external_board rows are One Acre Fund
-- (oneacrefund.org) and Zipline (zipline.com), both of which send applications
-- to the employer's own domain from the employer's own authorised Greenhouse
-- board. They are not labelled direct_employer because neither company has a
-- citation-backed app.company_domains row, and that table requires a
-- citation_id. Recording the domain to improve the label would mean inventing
-- a citation. Re-run this script after those domains are cited and the rows
-- will reclassify themselves.

with host as (
  select j.id,
         lower(regexp_replace(split_part(split_part(j.application_url,'://',2),'/',1),'^www\.','')) as h,
         j.company_id
  from app.jobs j
  where j.application_url is not null
),
classified as (
  select h.id,
    case
      when exists (
        select 1 from app.company_domains d
        where d.company_id = h.company_id
          and (h.h = lower(regexp_replace(d.domain,'^www\.',''))
            or h.h like '%.' || lower(regexp_replace(d.domain,'^www\.','')))
      ) then 'direct_employer'
      when h.h ~ '(^|\.)(boards\.greenhouse\.io|job-boards\.greenhouse\.io|job-boards\.eu\.greenhouse\.io|boards\.eu\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|jobs\.smartrecruiters\.com|myworkdayjobs\.com|icims\.com|bamboohr\.com|breezy\.hr|recruitee\.com|teamtailor\.com|join\.com)$'
        then 'employer_ats'
      when h.h ~ '(^|\.)(indeed\.com|linkedin\.com|glassdoor\.com|ziprecruiter\.com|simplyhired\.com|adzuna\.com|jooble\.org|talent\.com|learn4good\.com)$'
        then 'aggregator'
      else 'external_board'
    end as kind
  from host h
)
update app.jobs j
set application_destination_kind = c.kind
from classified c
where j.id = c.id
  and j.application_destination_kind is distinct from c.kind;
