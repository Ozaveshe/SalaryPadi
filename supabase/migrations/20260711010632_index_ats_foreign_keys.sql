create index if not exists ats_import_evidence_company_id_idx
  on audit.ats_import_evidence (company_id);
create index if not exists ats_import_evidence_source_id_idx
  on audit.ats_import_evidence (source_id);
create index if not exists ats_snapshot_runs_company_id_idx
  on ingest.ats_snapshot_runs (company_id);
create index if not exists ats_snapshot_seen_records_job_id_idx
  on ingest.ats_snapshot_seen_records (job_id);
create index if not exists ats_snapshot_seen_records_raw_record_id_idx
  on ingest.ats_snapshot_seen_records (raw_record_id);
