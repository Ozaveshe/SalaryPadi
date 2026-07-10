-- Invoker-only API wrappers must be able to resolve their two explicitly
-- granted implementations in the non-exposed security schema. Schema usage
-- does not expose the schema through PostgREST and does not grant execution on
-- any other routine.

grant usage on schema security to anon, authenticated;

