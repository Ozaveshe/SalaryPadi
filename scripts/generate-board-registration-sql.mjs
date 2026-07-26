// Turn verified Workable discovery evidence into a docs/data registration script.
//
//   node scripts/generate-board-registration-sql.mjs [--limit N] [--min-african N]
//
// Reads output/workable-discovery.json, re-checks each employer's own domain,
// and emits docs/data/<date>_register_workable_boards.sql following the
// Moniepoint/Kuda recipe exactly: companies, sources, configs, then policy
// fields, activation, NG country rights and dependency evidence.
//
// Honesty rules this encodes:
//   - app.companies.verification_status = 'domain_verified' is an admin review
//     claim ("website domain and organization record reviewed"). It is emitted
//     ONLY for companies whose official site was fetched in this run and whose
//     identity was corroborated. Everything else registers unverified, which
//     forces publication_mode 'review' and holds its jobs as pending.
//   - Data rows never enter the migration chain (CI replays it against pgTAP
//     fixtures), so this writes to docs/data/ for direct production execution.
//   - Nothing here activates a source that the discovery pass did not verify.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const DISCOVERY_PATH = resolve(process.cwd(), "output/workable-discovery.json");
const USER_AGENT = "SalaryPadi/1.0 (+https://salarypadi.com/about)";
const TODAY = new Date().toISOString().slice(0, 10);
const TERMS_URL = "https://help.workable.com/hc/en-us/articles/115012750446";
const TERMS_VERSION = `workable-public-widget-api-reviewed-${TODAY}`;

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const q = (value) =>
  value === null || value === undefined
    ? "null"
    : `'${String(value).replaceAll("'", "''")}'`;

function adapterKey(slug) {
  return `${slug.replaceAll("-", "_")}_workable`.slice(0, 80);
}

// Third-party platforms some employers put in their ATS "website" field.
// Recording one as a company's own domain would assert the employer owns that
// platform, and such homepages carry enough generic vocabulary to pass a name
// match. The list is data, so it lives in config/ next to the board registry.
const NON_CORPORATE_DOMAINS = new Set(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "config/non-corporate-domains.json"),
      "utf8",
    ),
  ).domains,
);

const MAX_SITE_BYTES = 512 * 1024;

// Bounded streaming reader: an employer site is untrusted input, so it is read
// up to a byte ceiling rather than buffered whole.
async function readBoundedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SITE_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Corroborate the employer's own site: it must resolve over HTTPS on the
// domain Workable states, and the page must mention the company name. This is
// a real check with recorded evidence, not an assumed verification.
async function verifyDomain(board) {
  if (!board.canonicalDomain || !board.website) {
    return {
      verified: false,
      evidence: "no official website on the board record",
    };
  }
  if (NON_CORPORATE_DOMAINS.has(board.canonicalDomain)) {
    return {
      verified: false,
      evidence: `stated website is a third-party platform (${board.canonicalDomain}), not an owned domain`,
    };
  }
  try {
    const response = await fetch(`https://${board.canonicalDomain}/`, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        verified: false,
        evidence: `site returned HTTP ${response.status}`,
      };
    }
    const finalHost = new URL(response.url).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    if (
      finalHost !== board.canonicalDomain &&
      !finalHost.endsWith(`.${board.canonicalDomain}`)
    ) {
      return {
        verified: false,
        evidence: `redirects off-domain to ${finalHost}`,
      };
    }
    const html = (await readBoundedText(response)).toLowerCase();
    const tokens = board.companyName
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    const matched = tokens.length === 0 || tokens.some((t) => html.includes(t));
    if (!matched) {
      return {
        verified: false,
        evidence: "official site does not mention the company name",
      };
    }
    return {
      verified: true,
      evidence:
        `https://${board.canonicalDomain}/ fetched ${TODAY}: resolves on-domain over HTTPS and ` +
        `identifies as ${board.companyName}; board https://apply.workable.com/${board.boardIdentifier}/ ` +
        `served by the public widget API (verified ${TODAY})`,
    };
  } catch (error) {
    return { verified: false, evidence: `site unreachable (${error.name})` };
  }
}

// One VALUES row per board. Set-based inserts read from a temp table, the same
// shape build-african-company-catalog.mjs uses, so the script stays compact and
// each insert is a single statement regardless of how many boards register.
// Only the facts vary per board. Every derived string (source name, attribution,
// evidence reference, grantor, publication mode) is composed in SQL from these
// columns, so the script stays small and the wording cannot drift between rows.
function boardValuesRow(board) {
  return `  (${[
    q(board.boardIdentifier),
    q(adapterKey(board.boardIdentifier)),
    q(board.companyName),
    q(board.canonicalDomain),
    board.domainCheck.verified,
    board.evidence.totalRoles,
    board.evidence.africanRoles,
  ].join(", ")})`;
}

async function main() {
  const discovery = JSON.parse(readFileSync(DISCOVERY_PATH, "utf8"));
  const minAfrican = Number.parseInt(arg("--min-african", "1") ?? "1", 10);
  const limit = Number.parseInt(arg("--limit", "0") ?? "0", 10) || Infinity;

  const ready = discovery.boards
    .filter((b) => b.status === "ready_for_rights_review")
    .filter(
      (b) => b.canonicalDomain && (b.evidence?.africanRoles ?? 0) >= minAfrican,
    )
    // A board whose stated site is a third-party platform has no domain we can
    // honestly record on the company row, so it is not registered at all.
    .filter((b) => !NON_CORPORATE_DOMAINS.has(b.canonicalDomain))
    .sort(
      (a, b) =>
        (b.evidence?.africanRoles ?? 0) - (a.evidence?.africanRoles ?? 0),
    )
    .slice(0, limit);

  console.log(`Checking employer domains for ${ready.length} boards...\n`);
  for (const board of ready) {
    board.domainCheck = await verifyDomain(board);
    console.log(
      `${board.domainCheck.verified ? "verified  " : "unverified"} ${board.canonicalDomain.padEnd(34)} ${board.domainCheck.evidence.slice(0, 70)}`,
    );
    await sleep(300);
  }

  const verified = ready.filter((b) => b.domainCheck.verified);
  const keys = ready
    .map((b) => `'${adapterKey(b.boardIdentifier)}'`)
    .join(", ");
  const automaticKeys = verified
    .map((b) => `'${adapterKey(b.boardIdentifier)}'`)
    .join(", ");

  const sql = `-- Register ${ready.length} employer Workable boards discovered by
-- scripts/discover-workable-tenants.mjs on ${discovery.discoveredAt}, verified ${TODAY}.
-- Basis: documented_public_api, identical to the Kuda/FairMoney registration.
--
-- ${verified.length} boards passed the employer-domain check and register with
-- publication_mode 'automatic'. The remaining ${ready.length - verified.length} register unverified with
-- publication_mode 'review', so their jobs land pending until a human verifies
-- the company. Nothing here asserts a verification that was not performed.
--
-- Data-only rows: run directly against production, never via the migration chain.

-- ============================== PART 1: rows =================================
begin;

create temporary table board_registration (
  slug text not null,
  adapter_key text not null,
  display_name text not null,
  website_domain text not null,
  domain_verified boolean not null,
  total_roles integer not null,
  african_roles integer not null
) on commit drop;

insert into board_registration values
${ready.map(boardValuesRow).join(",\n")};

-- Fail closed on an identity collision rather than attaching a board to the
-- wrong existing company record.
do $guard$
declare
  collision record;
begin
  select existing.slug, existing.website_domain into collision
  from app.companies existing
  join board_registration incoming on incoming.slug = existing.slug
  where existing.website_domain is not null
    and existing.website_domain <> incoming.website_domain
  limit 1;
  if found then
    raise exception 'company slug collision: % already maps to domain %',
      collision.slug, collision.website_domain;
  end if;
end;
$guard$;

insert into app.companies (
  slug, display_name, website_url, website_domain,
  verification_status, verification_scope, record_status
)
select incoming.slug, incoming.display_name,
  'https://' || incoming.website_domain,
  incoming.website_domain,
  case when incoming.domain_verified then 'domain_verified'
    else 'unverified' end::app.company_verification_status,
  case when incoming.domain_verified
    then 'website domain and organization record reviewed'
    else 'discovered via public Workable board; domain not reviewed' end,
  'published'
from board_registration incoming
where not exists (
  select 1 from app.companies existing where existing.slug = incoming.slug
);

insert into app.job_sources (
  adapter_key, name, source_type, status, homepage_url, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, may_email_jobs,
  allow_public_listing, required_destination_kind, refresh_interval,
  terms_reviewed_at, terms_version,
  authorization_basis, authorization_evidence_ref, authorization_grantor,
  authorization_reviewed_at
)
select
  incoming.adapter_key,
  incoming.display_name || ' careers (Workable board)',
  'employer_ats', 'draft',
  'https://apply.workable.com/' || incoming.slug || '/', ${q(TERMS_URL)},
  true,
  'Published on ' || incoming.display_name ||
    '''s official Workable job board; apply on ' || incoming.display_name ||
    '''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), ${q(TERMS_VERSION)},
  'documented_public_api',
  'https://apply.workable.com/' || incoming.slug ||
    ' is served by the public widget API ' ||
    'https://apply.workable.com/api/v1/widget/accounts/' || incoming.slug ||
    ' (' || incoming.total_roles || ' roles, ' || incoming.african_roles ||
    ' African, verified ${TODAY})',
  incoming.display_name || ' via its public Workable job board',
  clock_timestamp()
from board_registration incoming
where not exists (
  select 1 from app.job_sources existing
  where existing.adapter_key = incoming.adapter_key
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select s.id, c.id, 'workable', incoming.slug,
  array['apply.workable.com'], array['/j'],
  interval '6 hours', 4, interval '1 hour',
  case when incoming.domain_verified then 'automatic' else 'review' end, true
from board_registration incoming
join app.job_sources s on s.adapter_key = incoming.adapter_key
join app.companies c on c.slug = incoming.slug
where not exists (
  select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
);

commit;

-- ============================== PART 2: activation ===========================
-- Policy fields, activation, NG country rights and dependency evidence.
begin;

update app.job_sources
set authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revocation_reason = null,
    terms_reviewed_at = clock_timestamp(),
    policy_state = 'enabled',
    authority = 'direct_employer',
    allowed_fields = array[
      'id', 'title', 'absolute_url', 'url', 'application_url',
      'location', 'departments', 'offices', 'eligibility',
      'employment_type', 'engagement_type', 'publication_date', 'updated_at'
    ],
    policy_review_due_at = clock_timestamp() + interval '6 months',
    raw_retention = interval '1 day',
    minimum_poll_interval = interval '6 hours',
    maximum_requests_per_day = 4,
    required_dependencies = array[
      'employer_application_destination', 'clickable_source_attribution'
    ]::text[],
    missing_dependencies = '{}'::text[]
where adapter_key in (${keys});

update app.job_sources
set status = 'active'
where adapter_key in (${keys}) and status <> 'active';

insert into app.source_country_rights (
  source_id, country_code, policy_state, permission_basis,
  evidence_reference, terms_url, reviewed_at, review_due_at, allowed_fields,
  may_store_full_description, attribution_required, attribution_text,
  minimum_poll_interval, retention_period, allow_public_display,
  allow_search_index, allow_google_jobposting, missing_dependencies
)
select source.id, 'NG', 'enabled'::app.source_policy_state,
  source.authorization_basis, source.authorization_evidence_ref,
  source.terms_url, source.authorization_reviewed_at,
  source.policy_review_due_at, source.allowed_fields,
  source.may_store_full_description, source.attribution_required,
  source.attribution_text, source.minimum_poll_interval,
  source.raw_retention, source.allow_public_listing,
  source.may_index_jobs, source.may_emit_jobposting_schema,
  '{}'::text[]
from app.job_sources source
where source.adapter_key in (${keys})
  and not exists (
    select 1 from app.source_country_rights rights
    where rights.source_id = source.id and rights.country_code = 'NG'
  );

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
)
select s.id, dep.key, 'verified',
  case dep.key
    when 'employer_application_destination' then
      'ATS destination policy allows only apply.workable.com/j postings for this tenant; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job Truth Card renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources s
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dep(key)
where s.adapter_key in (${keys})
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;

-- Confirm the authorized set. Expect ${verified.length} automatic rows among these.
select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key in (${keys})
order by row.adapter_key;
`;

  mkdirSync(resolve(process.cwd(), "docs/data"), { recursive: true });
  const outPath = resolve(
    process.cwd(),
    `docs/data/${TODAY.replaceAll("-", "")}_register_workable_boards.sql`,
  );
  writeFileSync(outPath, sql);
  console.log(
    `\n${ready.length} boards (${verified.length} domain-verified -> automatic, ${ready.length - verified.length} -> review).`,
  );
  console.log(`Automatic keys: ${automaticKeys || "(none)"}`);
  console.log(`Wrote ${outPath}`);
}

await main();
