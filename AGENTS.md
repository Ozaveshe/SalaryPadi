<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Supabase safety boundary

- SalaryPadi production uses only the `supabase_salarypadi` MCP server or an explicitly project-scoped Supabase CLI/API command.
- Project ref: `bxelrhklsznmpksgrqep`.
- Do not use the generic `supabase`, `supabase_afrotools`, `supabase_latmtools`, or `supabase_oddspadi` targets for SalaryPadi work.
- Before every live write, verify the project URL is `https://bxelrhklsznmpksgrqep.supabase.co`.
