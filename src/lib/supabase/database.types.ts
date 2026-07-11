export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  api: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      companies: {
        Row: {
          description: string | null;
          display_name: string | null;
          headquarters_country: string | null;
          id: string | null;
          industry: string | null;
          locations: Json | null;
          size_band: string | null;
          slug: string | null;
          updated_at: string | null;
          verification_scope: string | null;
          verification_status:
            | "unverified"
            | "domain_verified"
            | "organization_verified"
            | "suspended"
            | null;
          website_url: string | null;
        };
        Insert: {
          description?: string | null;
          display_name?: string | null;
          headquarters_country?: string | null;
          id?: string | null;
          industry?: string | null;
          locations?: never;
          size_band?: string | null;
          slug?: string | null;
          updated_at?: string | null;
          verification_scope?: string | null;
          verification_status?:
            | "unverified"
            | "domain_verified"
            | "organization_verified"
            | "suspended"
            | null;
          website_url?: string | null;
        };
        Update: {
          description?: string | null;
          display_name?: string | null;
          headquarters_country?: string | null;
          id?: string | null;
          industry?: string | null;
          locations?: never;
          size_band?: string | null;
          slug?: string | null;
          updated_at?: string | null;
          verification_scope?: string | null;
          verification_status?:
            | "unverified"
            | "domain_verified"
            | "organization_verified"
            | "suspended"
            | null;
          website_url?: string | null;
        };
        Relationships: [];
      };
      company_benefits: {
        Row: {
          benefit_code: string | null;
          company_id: string | null;
          company_slug: string | null;
          confidence_label: string | null;
          description: string | null;
          id: string | null;
          label: string | null;
          last_verified_at: string | null;
          sample_size: number | null;
          source_kind:
            | "employer_provided"
            | "public_fact"
            | "community_reported"
            | "salarypadi_calculated"
            | null;
        };
        Relationships: [];
      };
      company_ratings: {
        Row: {
          company_id: string | null;
          company_slug: string | null;
          computed_at: string | null;
          confidence_label: string | null;
          id: string | null;
          overall_rating: number | null;
          rule_version_id: string | null;
          sample_size: number | null;
        };
        Relationships: [];
      };
      company_reviews: {
        Row: {
          advice_to_management: string | null;
          career_growth_rating: number | null;
          company_id: string | null;
          company_slug: string | null;
          compensation_rating: number | null;
          cons: string | null;
          country_code: string | null;
          employment_period_label: string | null;
          employment_status: string | null;
          id: string | null;
          management_rating: number | null;
          overall_rating: number | null;
          pay_reliability_rating: number | null;
          pros: string | null;
          published_at: string | null;
          role_family: string | null;
          role_family_id: string | null;
          role_slug: string | null;
          work_life_rating: number | null;
        };
        Relationships: [];
      };
      current_currency_rates: {
        Row: {
          attribution_text: string | null;
          base_currency: string | null;
          data_period: string | null;
          fetched_at: string | null;
          license_url: string | null;
          observed_at: string | null;
          provider_key: string | null;
          provider_name: string | null;
          quote_currency: string | null;
          rate: number | null;
          source_url: string | null;
        };
        Relationships: [];
      };
      interview_experiences: {
        Row: {
          application_source: string | null;
          approximate_duration_label: string | null;
          company_id: string | null;
          company_slug: string | null;
          country_code: string | null;
          difficulty: number | null;
          feedback_received: boolean | null;
          general_experience: string | null;
          id: string | null;
          outcome: string | null;
          published_at: string | null;
          question_themes: string | null;
          role_family: string | null;
          role_family_id: string | null;
          role_slug: string | null;
          seniority:
            | "entry"
            | "junior"
            | "mid"
            | "senior"
            | "lead"
            | "executive"
            | "unspecified"
            | null;
          stages: Json | null;
        };
        Relationships: [];
      };
      job_sources: {
        Row: {
          adapter_key: string | null;
          allow_public_listing: boolean | null;
          attribution_required: boolean | null;
          attribution_text: string | null;
          homepage_url: string | null;
          id: string | null;
          may_emit_jobposting_schema: boolean | null;
          may_index_jobs: boolean | null;
          may_store_full_description: boolean | null;
          name: string | null;
          refresh_interval_seconds: number | null;
          required_destination_kind: string | null;
          source_type:
            | "direct_employer"
            | "partner_feed"
            | "permitted_api"
            | "employer_ats"
            | "manual"
            | null;
          terms_reviewed_at: string | null;
          terms_url: string | null;
          terms_version: string | null;
        };
        Insert: {
          adapter_key?: string | null;
          allow_public_listing?: boolean | null;
          attribution_required?: boolean | null;
          attribution_text?: string | null;
          homepage_url?: string | null;
          id?: string | null;
          may_emit_jobposting_schema?: boolean | null;
          may_index_jobs?: boolean | null;
          may_store_full_description?: boolean | null;
          name?: string | null;
          refresh_interval_seconds?: never;
          required_destination_kind?: string | null;
          source_type?:
            | "direct_employer"
            | "partner_feed"
            | "permitted_api"
            | "employer_ats"
            | "manual"
            | null;
          terms_reviewed_at?: string | null;
          terms_url?: string | null;
          terms_version?: string | null;
        };
        Update: {
          adapter_key?: string | null;
          allow_public_listing?: boolean | null;
          attribution_required?: boolean | null;
          attribution_text?: string | null;
          homepage_url?: string | null;
          id?: string | null;
          may_emit_jobposting_schema?: boolean | null;
          may_index_jobs?: boolean | null;
          may_store_full_description?: boolean | null;
          name?: string | null;
          refresh_interval_seconds?: never;
          required_destination_kind?: string | null;
          source_type?:
            | "direct_employer"
            | "partner_feed"
            | "permitted_api"
            | "employer_ats"
            | "manual"
            | null;
          terms_reviewed_at?: string | null;
          terms_url?: string | null;
          terms_version?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          application_url: string | null;
          attribution_required: boolean | null;
          attribution_text: string | null;
          benefits_text: string | null;
          bonus_text: string | null;
          company_id: string | null;
          company_name: string | null;
          company_slug: string | null;
          company_verification_status:
            | "unverified"
            | "domain_verified"
            | "organization_verified"
            | "suspended"
            | null;
          currency_code: string | null;
          dedup_fingerprint: string | null;
          description_html: string | null;
          description_text: string | null;
          eligibility_countries: Json | null;
          eligibility_evidence: string | null;
          eligibility_provenance:
            "source_provided" | "manually_verified" | "inferred" | null;
          eligibility_scope:
            | "worldwide"
            | "africa"
            | "emea"
            | "nigeria"
            | "named_countries"
            | "restricted_region"
            | "unclear"
            | null;
          eligibility_verified_at: string | null;
          employment_type:
            | "full_time"
            | "part_time"
            | "contract"
            | "freelance"
            | "temporary"
            | "internship"
            | "graduate_trainee"
            | "other"
            | null;
          engagement_type:
            "employee" | "contractor" | "freelance" | "unspecified" | null;
          experience_level:
            | "entry"
            | "junior"
            | "mid"
            | "senior"
            | "lead"
            | "executive"
            | "unspecified"
            | null;
          external_source_id: string | null;
          gross_net: "gross" | "net" | "unspecified" | null;
          id: string | null;
          last_checked_at: string | null;
          last_verified_at: string | null;
          locations: Json | null;
          may_email_jobs: boolean | null;
          may_emit_jobposting_schema: boolean | null;
          may_index_jobs: boolean | null;
          may_store_full_description: boolean | null;
          pay_period:
            "hourly" | "daily" | "weekly" | "monthly" | "annual" | null;
          posted_at: string | null;
          refresh_interval_seconds: number | null;
          relocation_support: boolean | null;
          required_destination_kind: string | null;
          required_timezone_overlap: string | null;
          requirements_text: string | null;
          risk_indicators: Json | null;
          role_family: string | null;
          role_family_id: string | null;
          role_slug: string | null;
          salary_max: number | null;
          salary_min: number | null;
          skills: Json | null;
          slug: string | null;
          source_adapter_key: string | null;
          source_homepage_url: string | null;
          source_id: string | null;
          source_name: string | null;
          source_terms_url: string | null;
          source_type:
            | "direct_employer"
            | "partner_feed"
            | "permitted_api"
            | "employer_ats"
            | "manual"
            | null;
          source_url: string | null;
          terms_reviewed_at: string | null;
          title: string | null;
          valid_through: string | null;
          visa_sponsorship: boolean | null;
          work_arrangement:
            "remote" | "hybrid" | "onsite" | "unspecified" | null;
          work_authorization_requirement: string | null;
        };
        Relationships: [];
      };
      market_countries: {
        Row: {
          default_currency: string | null;
          is_launch_market: boolean | null;
          is_supported: boolean | null;
          iso2: string | null;
          name: string | null;
        };
        Insert: {
          default_currency?: string | null;
          is_launch_market?: boolean | null;
          is_supported?: boolean | null;
          iso2?: string | null;
          name?: string | null;
        };
        Update: {
          default_currency?: string | null;
          is_launch_market?: boolean | null;
          is_supported?: boolean | null;
          iso2?: string | null;
          name?: string | null;
        };
        Relationships: [];
      };
      my_analytics_consents: {
        Row: {
          allowed: boolean | null;
          captured_at: string | null;
          policy_version: string | null;
          purpose: string | null;
          revoked_at: string | null;
        };
        Insert: {
          allowed?: boolean | null;
          captured_at?: string | null;
          policy_version?: string | null;
          purpose?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          allowed?: boolean | null;
          captured_at?: string | null;
          policy_version?: string | null;
          purpose?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      my_application_history: {
        Row: {
          application_id: string | null;
          changed_at: string | null;
          id: string | null;
          new_status:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
          previous_status:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
        };
        Insert: {
          application_id?: string | null;
          changed_at?: string | null;
          id?: string | null;
          new_status?:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
          previous_status?:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
        };
        Update: {
          application_id?: string | null;
          changed_at?: string | null;
          id?: string | null;
          new_status?:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
          previous_status?:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
        };
        Relationships: [];
      };
      my_applications: {
        Row: {
          applied_at: string | null;
          created_at: string | null;
          id: string | null;
          job_id: string | null;
          next_action_at: string | null;
          private_notes: string | null;
          status:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
          updated_at: string | null;
        };
        Insert: {
          applied_at?: string | null;
          created_at?: string | null;
          id?: string | null;
          job_id?: string | null;
          next_action_at?: string | null;
          private_notes?: string | null;
          status?:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
          updated_at?: string | null;
        };
        Update: {
          applied_at?: string | null;
          created_at?: string | null;
          id?: string | null;
          job_id?: string | null;
          next_action_at?: string | null;
          private_notes?: string | null;
          status?:
            | "saved"
            | "applied"
            | "assessment"
            | "interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      my_company_claims: {
        Row: {
          company_id: string | null;
          corporate_domain: string | null;
          id: string | null;
          resolution_note: string | null;
          reviewed_at: string | null;
          status:
            | "pending"
            | "in_review"
            | "verified"
            | "rejected"
            | "revoked"
            | null;
          submitted_at: string | null;
        };
        Insert: {
          company_id?: string | null;
          corporate_domain?: string | null;
          id?: string | null;
          resolution_note?: string | null;
          reviewed_at?: string | null;
          status?:
            | "pending"
            | "in_review"
            | "verified"
            | "rejected"
            | "revoked"
            | null;
          submitted_at?: string | null;
        };
        Update: {
          company_id?: string | null;
          corporate_domain?: string | null;
          id?: string | null;
          resolution_note?: string | null;
          reviewed_at?: string | null;
          status?:
            | "pending"
            | "in_review"
            | "verified"
            | "rejected"
            | "revoked"
            | null;
          submitted_at?: string | null;
        };
        Relationships: [];
      };
      my_contributions: {
        Row: {
          decided_at: string | null;
          id: string | null;
          kind: "salary" | "review" | "interview" | null;
          state:
            | "draft"
            | "pending"
            | "in_review"
            | "revision_requested"
            | "escalated"
            | "approved"
            | "rejected"
            | "merged"
            | "removed"
            | null;
          submitted_at: string | null;
          version: number | null;
          withdrawn_at: string | null;
        };
        Insert: {
          decided_at?: string | null;
          id?: string | null;
          kind?: "salary" | "review" | "interview" | null;
          state?:
            | "draft"
            | "pending"
            | "in_review"
            | "revision_requested"
            | "escalated"
            | "approved"
            | "rejected"
            | "merged"
            | "removed"
            | null;
          submitted_at?: string | null;
          version?: number | null;
          withdrawn_at?: string | null;
        };
        Update: {
          decided_at?: string | null;
          id?: string | null;
          kind?: "salary" | "review" | "interview" | null;
          state?:
            | "draft"
            | "pending"
            | "in_review"
            | "revision_requested"
            | "escalated"
            | "approved"
            | "rejected"
            | "merged"
            | "removed"
            | null;
          submitted_at?: string | null;
          version?: number | null;
          withdrawn_at?: string | null;
        };
        Relationships: [];
      };
      my_employer_job_submissions: {
        Row: {
          application_url: string | null;
          company_id: string | null;
          company_name: string | null;
          country_code: string | null;
          currency_code: string | null;
          eligibility_scope:
            | "worldwide"
            | "africa"
            | "emea"
            | "nigeria"
            | "named_countries"
            | "restricted_region"
            | "unclear"
            | null;
          employment_type:
            | "full_time"
            | "part_time"
            | "contract"
            | "freelance"
            | "temporary"
            | "internship"
            | "graduate_trainee"
            | "other"
            | null;
          engagement_type:
            "employee" | "contractor" | "freelance" | "unspecified" | null;
          id: string | null;
          pay_period:
            "hourly" | "daily" | "weekly" | "monthly" | "annual" | null;
          salary_max: number | null;
          salary_min: number | null;
          status:
            | "draft"
            | "pending"
            | "in_review"
            | "revision_requested"
            | "approved"
            | "rejected"
            | "removed"
            | null;
          submitted_at: string | null;
          title: string | null;
          updated_at: string | null;
          work_arrangement:
            "remote" | "hybrid" | "onsite" | "unspecified" | null;
        };
        Insert: {
          application_url?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          country_code?: string | null;
          currency_code?: string | null;
          eligibility_scope?:
            | "worldwide"
            | "africa"
            | "emea"
            | "nigeria"
            | "named_countries"
            | "restricted_region"
            | "unclear"
            | null;
          employment_type?:
            | "full_time"
            | "part_time"
            | "contract"
            | "freelance"
            | "temporary"
            | "internship"
            | "graduate_trainee"
            | "other"
            | null;
          engagement_type?:
            "employee" | "contractor" | "freelance" | "unspecified" | null;
          id?: string | null;
          pay_period?:
            "hourly" | "daily" | "weekly" | "monthly" | "annual" | null;
          salary_max?: number | null;
          salary_min?: number | null;
          status?:
            | "draft"
            | "pending"
            | "in_review"
            | "revision_requested"
            | "approved"
            | "rejected"
            | "removed"
            | null;
          submitted_at?: string | null;
          title?: string | null;
          updated_at?: string | null;
          work_arrangement?:
            "remote" | "hybrid" | "onsite" | "unspecified" | null;
        };
        Update: {
          application_url?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          country_code?: string | null;
          currency_code?: string | null;
          eligibility_scope?:
            | "worldwide"
            | "africa"
            | "emea"
            | "nigeria"
            | "named_countries"
            | "restricted_region"
            | "unclear"
            | null;
          employment_type?:
            | "full_time"
            | "part_time"
            | "contract"
            | "freelance"
            | "temporary"
            | "internship"
            | "graduate_trainee"
            | "other"
            | null;
          engagement_type?:
            "employee" | "contractor" | "freelance" | "unspecified" | null;
          id?: string | null;
          pay_period?:
            "hourly" | "daily" | "weekly" | "monthly" | "annual" | null;
          salary_max?: number | null;
          salary_min?: number | null;
          status?:
            | "draft"
            | "pending"
            | "in_review"
            | "revision_requested"
            | "approved"
            | "rejected"
            | "removed"
            | null;
          submitted_at?: string | null;
          title?: string | null;
          updated_at?: string | null;
          work_arrangement?:
            "remote" | "hybrid" | "onsite" | "unspecified" | null;
        };
        Relationships: [];
      };
      my_job_alerts: {
        Row: {
          cadence: string | null;
          created_at: string | null;
          id: string | null;
          is_enabled: boolean | null;
          last_sent_at: string | null;
          name: string | null;
          search_spec: Json | null;
          updated_at: string | null;
        };
        Insert: {
          cadence?: string | null;
          created_at?: string | null;
          id?: string | null;
          is_enabled?: boolean | null;
          last_sent_at?: string | null;
          name?: string | null;
          search_spec?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          cadence?: string | null;
          created_at?: string | null;
          id?: string | null;
          is_enabled?: boolean | null;
          last_sent_at?: string | null;
          name?: string | null;
          search_spec?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      my_privacy_requests: {
        Row: {
          completed_at: string | null;
          id: string | null;
          kind:
            | "data_export"
            | "account_deletion"
            | "correction"
            | "contribution_deletion"
            | null;
          requested_at: string | null;
          resolution_note: string | null;
          status:
            | "pending"
            | "in_progress"
            | "completed"
            | "rejected"
            | "cancelled"
            | null;
          target_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          id?: string | null;
          kind?:
            | "data_export"
            | "account_deletion"
            | "correction"
            | "contribution_deletion"
            | null;
          requested_at?: string | null;
          resolution_note?: string | null;
          status?:
            | "pending"
            | "in_progress"
            | "completed"
            | "rejected"
            | "cancelled"
            | null;
          target_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          id?: string | null;
          kind?:
            | "data_export"
            | "account_deletion"
            | "correction"
            | "contribution_deletion"
            | null;
          requested_at?: string | null;
          resolution_note?: string | null;
          status?:
            | "pending"
            | "in_progress"
            | "completed"
            | "rejected"
            | "cancelled"
            | null;
          target_id?: string | null;
        };
        Relationships: [];
      };
      my_profile: {
        Row: {
          account_status:
            "active" | "suspended" | "deletion_pending" | "deleted" | null;
          country_code: string | null;
          created_at: string | null;
          locale: string | null;
          time_zone: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          account_status?:
            "active" | "suspended" | "deletion_pending" | "deleted" | null;
          country_code?: string | null;
          created_at?: string | null;
          locale?: string | null;
          time_zone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          account_status?:
            "active" | "suspended" | "deletion_pending" | "deleted" | null;
          country_code?: string | null;
          created_at?: string | null;
          locale?: string | null;
          time_zone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      my_reports: {
        Row: {
          category: string | null;
          created_at: string | null;
          id: string | null;
          resolved_at: string | null;
          status: "pending" | "in_review" | "resolved" | "dismissed" | null;
          target_id: string | null;
          target_kind:
            | "job"
            | "company"
            | "review"
            | "interview"
            | "feed_post"
            | "forum_thread"
            | "forum_reply"
            | null;
        };
        Insert: {
          category?: string | null;
          created_at?: string | null;
          id?: string | null;
          resolved_at?: string | null;
          status?: "pending" | "in_review" | "resolved" | "dismissed" | null;
          target_id?: string | null;
          target_kind?:
            | "job"
            | "company"
            | "review"
            | "interview"
            | "feed_post"
            | "forum_thread"
            | "forum_reply"
            | null;
        };
        Update: {
          category?: string | null;
          created_at?: string | null;
          id?: string | null;
          resolved_at?: string | null;
          status?: "pending" | "in_review" | "resolved" | "dismissed" | null;
          target_id?: string | null;
          target_kind?:
            | "job"
            | "company"
            | "review"
            | "interview"
            | "feed_post"
            | "forum_thread"
            | "forum_reply"
            | null;
        };
        Relationships: [];
      };
      my_saved_jobs: {
        Row: {
          created_at: string | null;
          job_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          job_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          job_id?: string | null;
        };
        Relationships: [];
      };
      my_staff_roles: {
        Row: {
          granted_at: string | null;
          role: "data_quality" | "moderator" | "admin" | null;
        };
        Insert: {
          granted_at?: string | null;
          role?: "data_quality" | "moderator" | "admin" | null;
        };
        Update: {
          granted_at?: string | null;
          role?: "data_quality" | "moderator" | "admin" | null;
        };
        Relationships: [];
      };
      privacy_thresholds: {
        Row: {
          effective_at: string | null;
          max_age_months: number | null;
          methodology_note: string | null;
          metric: string | null;
          min_distinct_contributors: number | null;
          min_range_contributors: number | null;
          minimum_publication_lag: string | null;
          version: number | null;
        };
        Insert: {
          effective_at?: string | null;
          max_age_months?: number | null;
          methodology_note?: string | null;
          metric?: string | null;
          min_distinct_contributors?: number | null;
          min_range_contributors?: number | null;
          minimum_publication_lag?: string | null;
          version?: number | null;
        };
        Update: {
          effective_at?: string | null;
          max_age_months?: number | null;
          methodology_note?: string | null;
          metric?: string | null;
          min_distinct_contributors?: number | null;
          min_range_contributors?: number | null;
          minimum_publication_lag?: string | null;
          version?: number | null;
        };
        Relationships: [];
      };
      salary_aggregates: {
        Row: {
          arrangement: string | null;
          calculated_at: string | null;
          company_id: string | null;
          company_slug: string | null;
          computed_at: string | null;
          confidence: string | null;
          confidence_label: string | null;
          country_code: string | null;
          currency: string | null;
          currency_code: string | null;
          engagement_type:
            "employee" | "contractor" | "freelance" | "unspecified" | null;
          gross_net: "gross" | "net" | "unspecified" | null;
          id: string | null;
          median_annual: number | null;
          p25_annual: number | null;
          p75_annual: number | null;
          percentile_25_annual: number | null;
          percentile_75_annual: number | null;
          role_family: string | null;
          role_family_id: string | null;
          role_slug: string | null;
          rule_version_id: string | null;
          sample_size: number | null;
          seniority: string | null;
          source_month_from: string | null;
          source_month_to: string | null;
          submission_month_end: string | null;
          submission_month_start: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_audit_events: {
        Args: { p_limit?: number };
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "event_log";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      admin_list_calculation_rules: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_companies: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_imports: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_jobs: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_moderation: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_reports: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_sources: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_list_users: {
        Args: never;
        Returns: {
          id: string;
          secondary: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      admin_transition: {
        Args: {
          action_name: string;
          action_reason: string;
          expected_version: number;
          resource_name: string;
          target_id: string;
        };
        Returns: boolean;
      };
      capture_analytics_event: {
        Args: { p_event_name: string; p_route_group: string };
        Returns: undefined;
      };
      create_job_alert:
        | {
            Args: { alert_cadence: string; alert_query: Json };
            Returns: string;
          }
        | {
            Args: { p_cadence?: string; p_name: string; p_search_spec: Json };
            Returns: string;
          };
      delete_job_alert: { Args: { p_alert_id: string }; Returns: boolean };
      get_forum_thread: {
        Args: { thread_id: string };
        Returns: {
          author_handle: string;
          author_name: string;
          body: string;
          created_at: string;
          id: string;
          is_mine: boolean;
          locked: boolean;
          title: string;
          topic_name: string;
          topic_slug: string;
        }[];
      };
      get_my_applications: {
        Args: never;
        Returns: {
          company_name: string;
          id: string;
          job_slug: string;
          next_action_at: string;
          private_notes: string;
          status: string;
          title: string;
          updated_at: string;
        }[];
      };
      get_my_community_profile: {
        Args: never;
        Returns: {
          display_name: string;
          handle: string;
          state_code: string;
        }[];
      };
      get_my_job_alerts: {
        Args: never;
        Returns: {
          active: boolean;
          cadence: string;
          created_at: string;
          id: string;
          query: Json;
        }[];
      };
      get_my_saved_jobs: {
        Args: never;
        Returns: {
          company_name: string;
          id: string;
          job_slug: string;
          saved_at: string;
          source_name: string;
          title: string;
        }[];
      };
      get_worker_health: {
        Args: never;
        Returns: {
          freshness: string;
          last_started_at: string;
          last_status: string;
          last_success_at: string;
          owner_label: string;
          task_key: string;
        }[];
      };
      has_staff_role: { Args: { required_role: string }; Returns: boolean };
      list_feed_posts: {
        Args: {
          category_filter?: string;
          page_limit?: number;
          state_filter?: string;
        };
        Returns: {
          author_handle: string;
          author_name: string;
          body: string;
          category: string;
          created_at: string;
          id: string;
          is_mine: boolean;
          state_code: string;
          state_name: string;
        }[];
      };
      list_forum_replies: {
        Args: { page_limit?: number; thread_id: string };
        Returns: {
          author_handle: string;
          author_name: string;
          body: string;
          created_at: string;
          id: string;
          is_mine: boolean;
        }[];
      };
      list_forum_threads: {
        Args: { page_limit?: number; topic_filter?: string };
        Returns: {
          author_handle: string;
          author_name: string;
          created_at: string;
          excerpt: string;
          id: string;
          is_mine: boolean;
          latest_activity_at: string;
          reply_count: number;
          title: string;
          topic_name: string;
          topic_slug: string;
        }[];
      };
      list_forum_topics: {
        Args: never;
        Returns: {
          description: string;
          id: string;
          latest_activity_at: string;
          name: string;
          slug: string;
          thread_count: number;
        }[];
      };
      list_nigeria_states: {
        Args: never;
        Returns: {
          code: string;
          name: string;
        }[];
      };
      normalize_contribution: {
        Args: {
          company_id: string;
          contribution_id: string;
          reason: string;
          role_family_id: string;
        };
        Returns: boolean;
      };
      publish_feed_post: {
        Args: {
          display_name: string;
          post_body: string;
          post_category: string;
          state_code: string;
        };
        Returns: string;
      };
      publish_forum_reply: {
        Args: {
          display_name: string;
          reply_body: string;
          state_code: string;
          thread_id: string;
        };
        Returns: string;
      };
      publish_forum_thread: {
        Args: {
          display_name: string;
          state_code: string;
          thread_body: string;
          thread_title: string;
          topic_slug: string;
        };
        Returns: string;
      };
      record_external_application: {
        Args: {
          application_status: string;
          company_name: string;
          external_id: string;
          job_slug: string;
          job_title: string;
          source_key: string;
          source_url: string;
        };
        Returns: string;
      };
      remove_application: {
        Args: { application_id: string };
        Returns: boolean;
      };
      remove_job_alert: { Args: { alert_id: string }; Returns: boolean };
      remove_my_community_content: {
        Args: { content_id: string; content_kind: string };
        Returns: boolean;
      };
      remove_saved_job: { Args: { saved_job_id: string }; Returns: boolean };
      report_content: {
        Args: {
          report_category: string;
          reported_id: string;
          reported_type: string;
        };
        Returns: string;
      };
      request_privacy_action: {
        Args: { p_details?: Json; p_kind: string; p_target_id?: string };
        Returns: string;
      };
      save_external_job: {
        Args: {
          company_name: string;
          eligibility_evidence?: string;
          external_id: string;
          job_slug: string;
          job_title: string;
          posted_at?: string;
          source_key: string;
          source_url: string;
        };
        Returns: string;
      };
      set_analytics_consent: {
        Args: {
          p_allowed: boolean;
          p_policy_version: string;
          p_purpose: string;
        };
        Returns: undefined;
      };
      set_job_saved: {
        Args: { p_job_id: string; p_saved: boolean };
        Returns: boolean;
      };
      set_staff_role: {
        Args: {
          p_grant: boolean;
          p_reason: string;
          p_role: string;
          p_target_user_id: string;
        };
        Returns: boolean;
      };
      submit_contribution: {
        Args: { contribution_kind: string; contribution_payload: Json };
        Returns: string;
      };
      submit_employer_job:
        | { Args: { p_payload: Json }; Returns: string }
        | {
            Args: {
              corporate_domain_matches: boolean;
              submission_payload: Json;
            };
            Returns: string;
          };
      submit_interview: { Args: { p_payload: Json }; Returns: string };
      submit_report: {
        Args: {
          p_category: string;
          p_narrative?: string;
          p_target_id: string;
          p_target_kind: string;
        };
        Returns: string;
      };
      submit_review: { Args: { p_payload: Json }; Returns: string };
      submit_salary: { Args: { p_payload: Json }; Returns: string };
      transition_moderation: {
        Args: {
          p_action: string;
          p_case_id: string;
          p_changed_fields?: string[];
          p_expected_version: number;
          p_linked_case_id?: string;
          p_public_payload?: Json;
          p_reason_code: string;
          p_reason_note?: string;
        };
        Returns: string;
      };
      update_application_status: {
        Args: {
          application_id: string;
          application_status: string;
          next_action_date?: string;
          notes?: string;
        };
        Returns: boolean;
      };
      update_my_profile: {
        Args: { p_country_code: string; p_locale: string; p_time_zone: string };
        Returns: undefined;
      };
      upsert_application: {
        Args: {
          p_job_id: string;
          p_next_action_at?: string;
          p_private_notes?: string;
          p_status: string;
        };
        Returns: string;
      };
      withdraw_contribution: {
        Args: { p_contribution_id: string };
        Returns: boolean;
      };
      worker_begin_ats_snapshot: {
        Args: {
          p_adapter_key: string;
          p_checked_at: string;
          p_expected_record_count: number;
          p_provider_count: number;
        };
        Returns: {
          import_run_id: string;
          should_run: boolean;
        }[];
      };
      worker_claim_alert_deliveries: {
        Args: { p_limit?: number };
        Returns: {
          alert_id: string;
          cadence: string;
          claim_token: string;
          delivery_id: string;
          last_sent_at: string;
          recipient_email: string;
          search_spec: Json;
        }[];
      };
      worker_claim_ats_source_fetch: {
        Args: {
          p_adapter_key: string;
          p_purpose: string;
          p_request_key: string;
        };
        Returns: boolean;
      };
      worker_claim_authorized_ats_source: {
        Args: {
          p_adapter_key: string;
          p_purpose: string;
          p_request_key: string;
        };
        Returns: Json;
      };
      worker_claim_remotive_fetch: {
        Args: { p_purpose: string; p_request_key: string };
        Returns: boolean;
      };
      worker_complete_alert_delivery: {
        Args: {
          p_claim_token: string;
          p_delivery_id: string;
          p_error_code?: string;
          p_matched_job_count?: number;
          p_outcome: string;
          p_provider_message_id?: string;
        };
        Returns: boolean;
      };
      worker_finalize_ats_snapshot: {
        Args: {
          p_complete: boolean;
          p_error_codes?: Json;
          p_import_run_id: string;
          p_quarantined_count?: number;
        };
        Returns: Json;
      };
      worker_finish: {
        Args: {
          p_error_code?: string;
          p_run_id: string;
          p_status: string;
          p_summary?: Json;
        };
        Returns: boolean;
      };
      worker_get_authorized_ats_source: {
        Args: { p_adapter_key: string };
        Returns: {
          adapter_key: string;
          allowed_destination_hosts: string[];
          allowed_destination_path_prefixes: string[];
          attribution_required: boolean;
          attribution_text: string;
          authorization_basis: string;
          authorization_evidence_ref: string;
          authorization_expires_at: string;
          authorization_grantor: string;
          authorization_reviewed_at: string;
          company_id: string;
          daily_request_budget: number;
          employer_name: string;
          fetch_interval_seconds: number;
          homepage_url: string;
          may_email_jobs: boolean;
          may_emit_jobposting_schema: boolean;
          may_index_jobs: boolean;
          may_store_full_description: boolean;
          minimum_request_spacing_seconds: number;
          provider: string;
          provider_region: string;
          publication_mode: string;
          required_destination_kind: string;
          source_id: string;
          source_name: string;
          tenant_identifier: string;
          terms_url: string;
          terms_version: string;
        }[];
      };
      worker_get_job_source_policy: {
        Args: { p_adapter_key: string };
        Returns: {
          adapter_key: string;
          allow_public_listing: boolean;
          attribution_required: boolean;
          attribution_text: string;
          homepage_url: string;
          may_emit_jobposting_schema: boolean;
          may_index_jobs: boolean;
          may_store_full_description: boolean;
          refresh_interval_seconds: number;
          required_destination_kind: string;
          review_requested_at: string;
          source_id: string;
          source_name: string;
          source_type: string;
          status: string;
          terms_reviewed_at: string;
          terms_reviewed_by: string;
          terms_url: string;
          terms_version: string;
        }[];
      };
      worker_list_authorized_ats_sources: {
        Args: never;
        Returns: {
          adapter_key: string;
          allowed_destination_hosts: string[];
          allowed_destination_path_prefixes: string[];
          attribution_required: boolean;
          attribution_text: string;
          authorization_basis: string;
          authorization_evidence_ref: string;
          authorization_expires_at: string;
          authorization_grantor: string;
          authorization_reviewed_at: string;
          company_id: string;
          daily_request_budget: number;
          employer_name: string;
          fetch_interval_seconds: number;
          homepage_url: string;
          may_email_jobs: boolean;
          may_emit_jobposting_schema: boolean;
          may_index_jobs: boolean;
          may_store_full_description: boolean;
          minimum_request_spacing_seconds: number;
          provider: string;
          provider_region: string;
          publication_mode: string;
          required_destination_kind: string;
          source_id: string;
          source_name: string;
          tenant_identifier: string;
          terms_url: string;
          terms_version: string;
        }[];
      };
      worker_record_source_import: {
        Args: {
          p_adapter_key: string;
          p_error_code?: string;
          p_fetched_count: number;
          p_status: string;
        };
        Returns: string;
      };
      worker_run_maintenance: { Args: never; Returns: Json };
      worker_start: {
        Args: {
          p_deploy_id?: string;
          p_run_key: string;
          p_scheduled_for?: string;
          p_task_key: string;
        };
        Returns: {
          run_id: string;
          should_run: boolean;
        }[];
      };
      worker_store_ats_snapshot_batch: {
        Args: { p_import_run_id: string; p_records: Json };
        Returns: Json;
      };
      worker_store_inforeuro_rates: {
        Args: { p_observed_at: string; p_rates: Json; p_source_url: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  api: {
    Enums: {},
  },
} as const;
