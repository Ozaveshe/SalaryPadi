begin;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Internal
-- security-definer routines are reachable only through deliberately granted
-- API wrappers, so remove both existing and future implicit grants.
revoke execute on all functions in schema security from public;
revoke execute on all functions in schema audit from public;
revoke execute on all functions in schema api from public;

alter default privileges in schema security
  revoke execute on functions from public;
alter default privileges in schema audit
  revoke execute on functions from public;
alter default privileges in schema api
  revoke execute on functions from public;

commit;
