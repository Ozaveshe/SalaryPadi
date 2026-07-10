import { PageHeading } from "@/components/page-heading";
import { requireAdmin } from "@/lib/auth/dal";

export default async function AdminOverviewPage() {
  const viewer = await requireAdmin();

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected operations"
        title="SalaryPadi control room"
        description="Source health, moderation and trust decisions remain separate from sponsorship. Every privileged write is expected to produce an audit action."
      />
      <div className="notice" role="status">
        Signed in as <strong>{viewer.email ?? viewer.id}</strong>. Database role
        membership, not this visible label, authorises admin actions.
      </div>
      <section
        className="rule-section stack"
        aria-labelledby="admin-principles"
      >
        <h2 className="section-title" id="admin-principles">
          Operational guardrails
        </h2>
        <dl className="data-list">
          <div>
            <dt>Publishing</dt>
            <dd>Pending by default; payment cannot bypass review.</dd>
          </div>
          <div>
            <dt>Contributors</dt>
            <dd>Identity is never shown to employers or public users.</dd>
          </div>
          <div>
            <dt>Eligibility</dt>
            <dd>Unclear evidence stays unclear until a manual verification.</dd>
          </div>
          <div>
            <dt>Audit</dt>
            <dd>
              Moderation and role changes require a reason and immutable action
              record.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
