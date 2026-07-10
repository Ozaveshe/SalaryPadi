import Link from "next/link";

export function BackendNotice() {
  return (
    <div className="notice notice-warning" role="status">
      <strong>Backend connection needed.</strong> A dedicated SalaryPadi
      Supabase project has not been configured in this environment. Public
      research and tools still work, but account data cannot be stored. See the{" "}
      <Link href="/methodology#data-environments">setup assumptions</Link>.
    </div>
  );
}
