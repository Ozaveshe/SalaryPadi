-- Register 100 employer Workable boards discovered by
-- scripts/discover-workable-tenants.mjs on 2026-07-26, verified 2026-07-26.
-- Basis: documented_public_api, identical to the Kuda/FairMoney registration.
--
-- 85 boards passed the employer-domain check and register with
-- publication_mode 'automatic'. The remaining 15 register unverified with
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
  ('egypt-education-platform', 'egypt_education_platform_workable', 'Egypt Education Platform', 'egypteducationplatform.com', true, 199, 197),
  ('eva-pharma', 'eva_pharma_workable', 'Eva Pharma', 'evapharma.com', true, 160, 146),
  ('remote-recruitment', 'remote_recruitment_workable', 'Remote Recruitment', 'remoterecruitment.co.za', true, 124, 124),
  ('nawy-real-estate', 'nawy_real_estate_workable', 'Nawy Real Estate', 'nawy.com', true, 115, 115),
  ('remote-raven', 'remote_raven_workable', 'Remote Raven', 'hireremoteraven.com', true, 284, 106),
  ('virtuhire', 'virtuhire_workable', 'VirtuHire', 'virtuhire.com', true, 104, 98),
  ('tehora', 'tehora_workable', 'TEHORA', 'tehora.ca', true, 1310, 68),
  ('peopleworth', 'peopleworth_workable', 'peopleworth', 'peopleworth.ai', true, 147, 58),
  ('robusta', 'robusta_workable', 'robusta', 'robustastudio.com', false, 78, 40),
  ('integrant', 'integrant_workable', 'Integrant', 'integrant.com', true, 31, 31),
  ('hyperiondev', 'hyperiondev_workable', 'HyperionDev', 'hyperiondev.com', true, 30, 30),
  ('linah-group', 'linah_group_workable', 'Linah Group', 'linahgroup.com', false, 29, 29),
  ('stethoscope-sa', 'stethoscope_sa_workable', 'Stethoscope SA', 'stethoscopesa.co.za', true, 28, 28),
  ('chaingpt', 'chaingpt_workable', 'ChainGPT', 'chaingpt.org', true, 114, 27),
  ('arvo', 'arvo_workable', 'ARVO', 'arvo.co.za', true, 27, 26),
  ('quickteam', 'quickteam_workable', 'QuickTeam', 'quickteamsolutions.com', false, 43, 24),
  ('inkomoko', 'inkomoko_workable', 'Inkomoko', 'inkomoko.com', true, 30, 23),
  ('growth-resourcing', 'growth_resourcing_workable', 'Growth Resourcing', 'growthresourcing.co.uk', true, 20, 20),
  ('jobrack', 'jobrack_workable', 'JobRack', 'jobrack.eu', false, 116, 20),
  ('nowlun', 'nowlun_workable', 'Nowlun', 'nowlun.com', true, 24, 19),
  ('optasia', 'optasia_workable', 'Optasia', 'optasia.com', false, 58, 18),
  ('ischool', 'ischool_workable', 'iSchool', 'ischooltech.com', true, 17, 17),
  ('keen', 'keen_workable', 'Keen', 'keentohire.com', true, 18, 17),
  ('dotactiv', 'dotactiv_workable', 'DotActiv', 'dotactiv.com', true, 16, 16),
  ('ten-group', 'ten_group_workable', 'Ten Group', 'tengroup.com', false, 101, 16),
  ('ajaia', 'ajaia_workable', 'AJAIA', 'ajaia.ai', true, 244, 15),
  ('cullinan-holdings', 'cullinan_holdings_workable', 'Cullinan Holdings', 'cullinan.co.za', false, 14, 14),
  ('afreximbank', 'afreximbank_workable', 'Afreximbank', 'afreximbank.com', true, 15, 14),
  ('genesis-analytics', 'genesis_analytics_workable', 'Genesis Analytics', 'genesis-analytics.com', true, 14, 13),
  ('sarmad', 'sarmad_workable', 'Sarmad', 'sarmad.sa', true, 13, 13),
  ('azeus-convene', 'azeus_convene_workable', 'Azeus Convene', 'azeusconvene.com', true, 73, 12),
  ('foodics', 'foodics_workable', 'Foodics', 'foodics.com', true, 35, 12),
  ('vivo-energy', 'vivo_energy_workable', 'Vivo Energy', 'vivoenergy.com', true, 32, 12),
  ('cuso-international', 'cuso_international_workable', 'Cuso International', 'cusointernational.org', true, 53, 12),
  ('petroapp', 'petroapp_workable', 'PetroApp', 'petroapp.com', true, 22, 11),
  ('wateraid', 'wateraid_workable', 'WaterAid', 'wateraid.org', false, 15, 10),
  ('action-against-hunger', 'action_against_hunger_workable', 'Action Against Hunger', 'actionagainsthunger.org', true, 20, 9),
  ('sihamco', 'sihamco_workable', 'SIHAMCO', 'sihamco.com', true, 53, 9),
  ('clickatell', 'clickatell_workable', 'Clickatell', 'clickatell.com', true, 9, 9),
  ('invisionhr', 'invisionhr_workable', 'InvisionHR', 'invisionhr.co.za', true, 9, 9),
  ('fusiontek', 'fusiontek_workable', 'FusionTek', 'fusiontek.com', true, 24, 9),
  ('arcsen', 'arcsen_workable', 'Arcsen', 'arcsen.com', true, 14, 9),
  ('zaintech', 'zaintech_workable', 'ZainTECH', 'zaintech.com', true, 51, 9),
  ('interpath-advisory', 'interpath_advisory_workable', 'Interpath Advisory', 'interpath.com', true, 144, 9),
  ('infomineo', 'infomineo_workable', 'Infomineo', 'infomineo.com', true, 10, 8),
  ('division50', 'division50_workable', 'division50', 'division50.com', true, 47, 8),
  ('aristo-sourcing', 'aristo_sourcing_workable', 'Aristo Sourcing', 'aristosourcing.com', true, 11, 8),
  ('bluecloud-technologies', 'bluecloud_technologies_workable', 'BlueCloud Technologies', 'bluecloudcorp.com', false, 8, 8),
  ('arpu-telecommunication-services', 'arpu_telecommunication_services_workable', 'Arpu Telecommunication Services', 'arpuplus.com', true, 9, 8),
  ('partner-one-capital', 'partner_one_capital_workable', 'Partner One Capital', 'partneronecapital.com', false, 106, 8),
  ('flatgigs', 'flatgigs_workable', 'Flatgigs', 'flatgigs.com', true, 89, 8),
  ('remofirst', 'remofirst_workable', 'Remofirst', 'remofirst.com', true, 42, 8),
  ('innovationteam', 'innovationteam_workable', 'InnovationTeam', 'innovationteam.com', true, 51, 8),
  ('teltonika', 'teltonika_workable', 'Teltonika', 'teltonika-iot-group.com', true, 203, 7),
  ('opsfi', 'opsfi_workable', 'OpsFi', 'opsfi.co', true, 7, 7),
  ('vista-group', 'vista_group_workable', 'Vista Group', 'vistagroup.co.nz', true, 24, 7),
  ('limitless-naturals', 'limitless_naturals_workable', 'Limitless Naturals', 'limitlessnaturals.com', true, 10, 7),
  ('mondia-group', 'mondia_group_workable', 'Mondia Group', 'mondia.com', true, 15, 7),
  ('lucidya', 'lucidya_workable', 'Lucidya', 'lucidya.com', true, 41, 7),
  ('webook', 'webook_workable', 'webook.com', 'webook.com', true, 90, 7),
  ('african-safari-group', 'african_safari_group_workable', 'African Safari Group', 'africansafarigroup.com', true, 7, 7),
  ('huble', 'huble_workable', 'Huble', 'hubledigital.com', false, 20, 6),
  ('intx-insurance-software', 'intx_insurance_software_workable', 'INTX Insurance Software', 'intxis.com', false, 8, 6),
  ('delta-v', 'delta_v_workable', 'Delta-v', 'delta-v.co.za', false, 6, 6),
  ('auto24', 'auto24_workable', 'AUTO24', 'auto24.africa', true, 6, 6),
  ('adree', 'adree_workable', 'Adree', 'adree.com', true, 17, 6),
  ('alumil-misr', 'alumil_misr_workable', 'Alumil MISR', 'alumil.com', true, 6, 6),
  ('tamatem', 'tamatem_workable', 'Tamatem', 'tamatem.co', true, 23, 5),
  ('volga-partners', 'volga_partners_workable', 'Volga Partners', 'volgapartners.com', true, 96, 5),
  ('openfn', 'openfn_workable', 'OpenFn', 'openfn.org', true, 5, 5),
  ('human-intelligence', 'human_intelligence_workable', 'Human Intelligence', 'shaewellness.com', true, 22, 3),
  ('pipeline-gurus', 'pipeline_gurus_workable', 'Pipeline Gurus', 'pipelinegurus.com', true, 3, 3),
  ('flapkap', 'flapkap_workable', 'FlapKap', 'flapkap.com', false, 3, 3),
  ('sweat-pants-agency', 'sweat_pants_agency_workable', 'Sweat Pants Agency', 'sweatpantsagency.com', true, 53, 3),
  ('cgiar', 'cgiar_workable', 'CGIAR', 'cgiar.org', true, 6, 2),
  ('cloudfactory', 'cloudfactory_workable', 'CloudFactory', 'cloudfactory.com', true, 83, 2),
  ('european-dynamics', 'european_dynamics_workable', 'EUROPEAN DYNAMICS', 'eurodyn.com', true, 139, 2),
  ('q2impact', 'q2impact_workable', 'Q2Impact', 'q2impact.com', true, 14, 2),
  ('rising-academies', 'rising_academies_workable', 'Rising Academies', 'risingacademies.com', true, 2, 2),
  ('euromonitor', 'euromonitor_workable', 'Euromonitor', 'euromonitor.com', true, 49, 2),
  ('gathern', 'gathern_workable', 'Gathern', 'gathern.co', true, 9, 2),
  ('smeetz', 'smeetz_workable', 'Smeetz', 'smeetz.com', true, 9, 2),
  ('visit', 'visit_workable', 'Visit.org', 'visit.org', true, 104, 2),
  ('khibraty', 'khibraty_workable', 'Khibraty', 'khibraty.com', true, 103, 2),
  ('agad-technology', 'agad_technology_workable', 'AGAD Technology', 'agadtechnology.com', true, 6, 2),
  ('shiftmove', 'shiftmove_workable', 'Shiftmove', 'shiftmove.com', true, 35, 2),
  ('solution-sft', 'solution_sft_workable', 'Solution SFT', 'solutionsft.com', true, 476, 2),
  ('hadley-designs', 'hadley_designs_workable', 'Hadley Designs', 'hadleydesigns.com', true, 38, 1),
  ('mlabs', 'mlabs_workable', 'MLabs', 'mlabs.city', true, 193, 1),
  ('bebaxpress', 'bebaxpress_workable', 'BebaXpress', 'bebaxpress.com', true, 1, 1),
  ('agility', 'agility_workable', 'Agility', 'agility.com', true, 21, 1),
  ('semata', 'semata_workable', 'Semata', 'semata.ai', true, 1, 1),
  ('storyteq', 'storyteq_workable', 'Storyteq', 'storyteq.com', true, 9, 1),
  ('erg-media', 'erg_media_workable', 'ERG Media', 'erg.media', true, 8, 1),
  ('webafrica', 'webafrica_workable', 'Webafrica', 'webafrica.co.za', false, 1, 1),
  ('longdue-games', 'longdue_games_workable', 'Longdue Games', 'longduegames.com', true, 4, 1),
  ('edge-tutor-international', 'edge_tutor_international_workable', 'Edge Tutor International', 'edgetutor.co', true, 2, 1),
  ('happy-pay', 'happy_pay_workable', 'Happy Pay', 'happypay.co.za', true, 1, 1),
  ('deployteq', 'deployteq_workable', 'Deployteq', 'deployteq.com', true, 8, 1),
  ('pele-energy-group', 'pele_energy_group_workable', 'Pele Energy Group', 'peleenergygroup.com', true, 1, 1);

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
  'https://apply.workable.com/' || incoming.slug || '/', 'https://help.workable.com/hc/en-us/articles/115012750446',
  true,
  'Published on ' || incoming.display_name ||
    '''s official Workable job board; apply on ' || incoming.display_name ||
    '''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'workable-public-widget-api-reviewed-2026-07-26',
  'documented_public_api',
  'https://apply.workable.com/' || incoming.slug ||
    ' is served by the public widget API ' ||
    'https://apply.workable.com/api/v1/widget/accounts/' || incoming.slug ||
    ' (' || incoming.total_roles || ' roles, ' || incoming.african_roles ||
    ' African, verified 2026-07-26)',
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
where adapter_key in ('egypt_education_platform_workable', 'eva_pharma_workable', 'remote_recruitment_workable', 'nawy_real_estate_workable', 'remote_raven_workable', 'virtuhire_workable', 'tehora_workable', 'peopleworth_workable', 'robusta_workable', 'integrant_workable', 'hyperiondev_workable', 'linah_group_workable', 'stethoscope_sa_workable', 'chaingpt_workable', 'arvo_workable', 'quickteam_workable', 'inkomoko_workable', 'growth_resourcing_workable', 'jobrack_workable', 'nowlun_workable', 'optasia_workable', 'ischool_workable', 'keen_workable', 'dotactiv_workable', 'ten_group_workable', 'ajaia_workable', 'cullinan_holdings_workable', 'afreximbank_workable', 'genesis_analytics_workable', 'sarmad_workable', 'azeus_convene_workable', 'foodics_workable', 'vivo_energy_workable', 'cuso_international_workable', 'petroapp_workable', 'wateraid_workable', 'action_against_hunger_workable', 'sihamco_workable', 'clickatell_workable', 'invisionhr_workable', 'fusiontek_workable', 'arcsen_workable', 'zaintech_workable', 'interpath_advisory_workable', 'infomineo_workable', 'division50_workable', 'aristo_sourcing_workable', 'bluecloud_technologies_workable', 'arpu_telecommunication_services_workable', 'partner_one_capital_workable', 'flatgigs_workable', 'remofirst_workable', 'innovationteam_workable', 'teltonika_workable', 'opsfi_workable', 'vista_group_workable', 'limitless_naturals_workable', 'mondia_group_workable', 'lucidya_workable', 'webook_workable', 'african_safari_group_workable', 'huble_workable', 'intx_insurance_software_workable', 'delta_v_workable', 'auto24_workable', 'adree_workable', 'alumil_misr_workable', 'tamatem_workable', 'volga_partners_workable', 'openfn_workable', 'human_intelligence_workable', 'pipeline_gurus_workable', 'flapkap_workable', 'sweat_pants_agency_workable', 'cgiar_workable', 'cloudfactory_workable', 'european_dynamics_workable', 'q2impact_workable', 'rising_academies_workable', 'euromonitor_workable', 'gathern_workable', 'smeetz_workable', 'visit_workable', 'khibraty_workable', 'agad_technology_workable', 'shiftmove_workable', 'solution_sft_workable', 'hadley_designs_workable', 'mlabs_workable', 'bebaxpress_workable', 'agility_workable', 'semata_workable', 'storyteq_workable', 'erg_media_workable', 'webafrica_workable', 'longdue_games_workable', 'edge_tutor_international_workable', 'happy_pay_workable', 'deployteq_workable', 'pele_energy_group_workable');

update app.job_sources
set status = 'active'
where adapter_key in ('egypt_education_platform_workable', 'eva_pharma_workable', 'remote_recruitment_workable', 'nawy_real_estate_workable', 'remote_raven_workable', 'virtuhire_workable', 'tehora_workable', 'peopleworth_workable', 'robusta_workable', 'integrant_workable', 'hyperiondev_workable', 'linah_group_workable', 'stethoscope_sa_workable', 'chaingpt_workable', 'arvo_workable', 'quickteam_workable', 'inkomoko_workable', 'growth_resourcing_workable', 'jobrack_workable', 'nowlun_workable', 'optasia_workable', 'ischool_workable', 'keen_workable', 'dotactiv_workable', 'ten_group_workable', 'ajaia_workable', 'cullinan_holdings_workable', 'afreximbank_workable', 'genesis_analytics_workable', 'sarmad_workable', 'azeus_convene_workable', 'foodics_workable', 'vivo_energy_workable', 'cuso_international_workable', 'petroapp_workable', 'wateraid_workable', 'action_against_hunger_workable', 'sihamco_workable', 'clickatell_workable', 'invisionhr_workable', 'fusiontek_workable', 'arcsen_workable', 'zaintech_workable', 'interpath_advisory_workable', 'infomineo_workable', 'division50_workable', 'aristo_sourcing_workable', 'bluecloud_technologies_workable', 'arpu_telecommunication_services_workable', 'partner_one_capital_workable', 'flatgigs_workable', 'remofirst_workable', 'innovationteam_workable', 'teltonika_workable', 'opsfi_workable', 'vista_group_workable', 'limitless_naturals_workable', 'mondia_group_workable', 'lucidya_workable', 'webook_workable', 'african_safari_group_workable', 'huble_workable', 'intx_insurance_software_workable', 'delta_v_workable', 'auto24_workable', 'adree_workable', 'alumil_misr_workable', 'tamatem_workable', 'volga_partners_workable', 'openfn_workable', 'human_intelligence_workable', 'pipeline_gurus_workable', 'flapkap_workable', 'sweat_pants_agency_workable', 'cgiar_workable', 'cloudfactory_workable', 'european_dynamics_workable', 'q2impact_workable', 'rising_academies_workable', 'euromonitor_workable', 'gathern_workable', 'smeetz_workable', 'visit_workable', 'khibraty_workable', 'agad_technology_workable', 'shiftmove_workable', 'solution_sft_workable', 'hadley_designs_workable', 'mlabs_workable', 'bebaxpress_workable', 'agility_workable', 'semata_workable', 'storyteq_workable', 'erg_media_workable', 'webafrica_workable', 'longdue_games_workable', 'edge_tutor_international_workable', 'happy_pay_workable', 'deployteq_workable', 'pele_energy_group_workable') and status <> 'active';

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
where source.adapter_key in ('egypt_education_platform_workable', 'eva_pharma_workable', 'remote_recruitment_workable', 'nawy_real_estate_workable', 'remote_raven_workable', 'virtuhire_workable', 'tehora_workable', 'peopleworth_workable', 'robusta_workable', 'integrant_workable', 'hyperiondev_workable', 'linah_group_workable', 'stethoscope_sa_workable', 'chaingpt_workable', 'arvo_workable', 'quickteam_workable', 'inkomoko_workable', 'growth_resourcing_workable', 'jobrack_workable', 'nowlun_workable', 'optasia_workable', 'ischool_workable', 'keen_workable', 'dotactiv_workable', 'ten_group_workable', 'ajaia_workable', 'cullinan_holdings_workable', 'afreximbank_workable', 'genesis_analytics_workable', 'sarmad_workable', 'azeus_convene_workable', 'foodics_workable', 'vivo_energy_workable', 'cuso_international_workable', 'petroapp_workable', 'wateraid_workable', 'action_against_hunger_workable', 'sihamco_workable', 'clickatell_workable', 'invisionhr_workable', 'fusiontek_workable', 'arcsen_workable', 'zaintech_workable', 'interpath_advisory_workable', 'infomineo_workable', 'division50_workable', 'aristo_sourcing_workable', 'bluecloud_technologies_workable', 'arpu_telecommunication_services_workable', 'partner_one_capital_workable', 'flatgigs_workable', 'remofirst_workable', 'innovationteam_workable', 'teltonika_workable', 'opsfi_workable', 'vista_group_workable', 'limitless_naturals_workable', 'mondia_group_workable', 'lucidya_workable', 'webook_workable', 'african_safari_group_workable', 'huble_workable', 'intx_insurance_software_workable', 'delta_v_workable', 'auto24_workable', 'adree_workable', 'alumil_misr_workable', 'tamatem_workable', 'volga_partners_workable', 'openfn_workable', 'human_intelligence_workable', 'pipeline_gurus_workable', 'flapkap_workable', 'sweat_pants_agency_workable', 'cgiar_workable', 'cloudfactory_workable', 'european_dynamics_workable', 'q2impact_workable', 'rising_academies_workable', 'euromonitor_workable', 'gathern_workable', 'smeetz_workable', 'visit_workable', 'khibraty_workable', 'agad_technology_workable', 'shiftmove_workable', 'solution_sft_workable', 'hadley_designs_workable', 'mlabs_workable', 'bebaxpress_workable', 'agility_workable', 'semata_workable', 'storyteq_workable', 'erg_media_workable', 'webafrica_workable', 'longdue_games_workable', 'edge_tutor_international_workable', 'happy_pay_workable', 'deployteq_workable', 'pele_energy_group_workable')
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
where s.adapter_key in ('egypt_education_platform_workable', 'eva_pharma_workable', 'remote_recruitment_workable', 'nawy_real_estate_workable', 'remote_raven_workable', 'virtuhire_workable', 'tehora_workable', 'peopleworth_workable', 'robusta_workable', 'integrant_workable', 'hyperiondev_workable', 'linah_group_workable', 'stethoscope_sa_workable', 'chaingpt_workable', 'arvo_workable', 'quickteam_workable', 'inkomoko_workable', 'growth_resourcing_workable', 'jobrack_workable', 'nowlun_workable', 'optasia_workable', 'ischool_workable', 'keen_workable', 'dotactiv_workable', 'ten_group_workable', 'ajaia_workable', 'cullinan_holdings_workable', 'afreximbank_workable', 'genesis_analytics_workable', 'sarmad_workable', 'azeus_convene_workable', 'foodics_workable', 'vivo_energy_workable', 'cuso_international_workable', 'petroapp_workable', 'wateraid_workable', 'action_against_hunger_workable', 'sihamco_workable', 'clickatell_workable', 'invisionhr_workable', 'fusiontek_workable', 'arcsen_workable', 'zaintech_workable', 'interpath_advisory_workable', 'infomineo_workable', 'division50_workable', 'aristo_sourcing_workable', 'bluecloud_technologies_workable', 'arpu_telecommunication_services_workable', 'partner_one_capital_workable', 'flatgigs_workable', 'remofirst_workable', 'innovationteam_workable', 'teltonika_workable', 'opsfi_workable', 'vista_group_workable', 'limitless_naturals_workable', 'mondia_group_workable', 'lucidya_workable', 'webook_workable', 'african_safari_group_workable', 'huble_workable', 'intx_insurance_software_workable', 'delta_v_workable', 'auto24_workable', 'adree_workable', 'alumil_misr_workable', 'tamatem_workable', 'volga_partners_workable', 'openfn_workable', 'human_intelligence_workable', 'pipeline_gurus_workable', 'flapkap_workable', 'sweat_pants_agency_workable', 'cgiar_workable', 'cloudfactory_workable', 'european_dynamics_workable', 'q2impact_workable', 'rising_academies_workable', 'euromonitor_workable', 'gathern_workable', 'smeetz_workable', 'visit_workable', 'khibraty_workable', 'agad_technology_workable', 'shiftmove_workable', 'solution_sft_workable', 'hadley_designs_workable', 'mlabs_workable', 'bebaxpress_workable', 'agility_workable', 'semata_workable', 'storyteq_workable', 'erg_media_workable', 'webafrica_workable', 'longdue_games_workable', 'edge_tutor_international_workable', 'happy_pay_workable', 'deployteq_workable', 'pele_energy_group_workable')
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;

-- Confirm the authorized set. Expect 85 automatic rows among these.
select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key in ('egypt_education_platform_workable', 'eva_pharma_workable', 'remote_recruitment_workable', 'nawy_real_estate_workable', 'remote_raven_workable', 'virtuhire_workable', 'tehora_workable', 'peopleworth_workable', 'robusta_workable', 'integrant_workable', 'hyperiondev_workable', 'linah_group_workable', 'stethoscope_sa_workable', 'chaingpt_workable', 'arvo_workable', 'quickteam_workable', 'inkomoko_workable', 'growth_resourcing_workable', 'jobrack_workable', 'nowlun_workable', 'optasia_workable', 'ischool_workable', 'keen_workable', 'dotactiv_workable', 'ten_group_workable', 'ajaia_workable', 'cullinan_holdings_workable', 'afreximbank_workable', 'genesis_analytics_workable', 'sarmad_workable', 'azeus_convene_workable', 'foodics_workable', 'vivo_energy_workable', 'cuso_international_workable', 'petroapp_workable', 'wateraid_workable', 'action_against_hunger_workable', 'sihamco_workable', 'clickatell_workable', 'invisionhr_workable', 'fusiontek_workable', 'arcsen_workable', 'zaintech_workable', 'interpath_advisory_workable', 'infomineo_workable', 'division50_workable', 'aristo_sourcing_workable', 'bluecloud_technologies_workable', 'arpu_telecommunication_services_workable', 'partner_one_capital_workable', 'flatgigs_workable', 'remofirst_workable', 'innovationteam_workable', 'teltonika_workable', 'opsfi_workable', 'vista_group_workable', 'limitless_naturals_workable', 'mondia_group_workable', 'lucidya_workable', 'webook_workable', 'african_safari_group_workable', 'huble_workable', 'intx_insurance_software_workable', 'delta_v_workable', 'auto24_workable', 'adree_workable', 'alumil_misr_workable', 'tamatem_workable', 'volga_partners_workable', 'openfn_workable', 'human_intelligence_workable', 'pipeline_gurus_workable', 'flapkap_workable', 'sweat_pants_agency_workable', 'cgiar_workable', 'cloudfactory_workable', 'european_dynamics_workable', 'q2impact_workable', 'rising_academies_workable', 'euromonitor_workable', 'gathern_workable', 'smeetz_workable', 'visit_workable', 'khibraty_workable', 'agad_technology_workable', 'shiftmove_workable', 'solution_sft_workable', 'hadley_designs_workable', 'mlabs_workable', 'bebaxpress_workable', 'agility_workable', 'semata_workable', 'storyteq_workable', 'erg_media_workable', 'webafrica_workable', 'longdue_games_workable', 'edge_tutor_international_workable', 'happy_pay_workable', 'deployteq_workable', 'pele_energy_group_workable')
order by row.adapter_key;
