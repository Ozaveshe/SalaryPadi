import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import { searchSalaryAggregates } from "@/lib/salaries/repository";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; role: string }>;
}): Promise<Metadata> {
  const { country, role } = await params;
  const results = await searchSalaryAggregates({
    country,
    role: role.replace(/-/g, " "),
  });
  return {
    title: `${role.replace(/-/g, " ")} salary in ${country.toUpperCase()}`,
    robots: { index: results.length > 0, follow: true },
  };
}

export default async function SalaryRolePage({
  params,
}: {
  params: Promise<{ country: string; role: string }>;
}) {
  const { country, role } = await params;
  if (!/^[a-z]{2}$/i.test(country) || !/^[a-z0-9-]{2,100}$/i.test(role))
    notFound();
  const roleName = role.replace(/-/g, " ");
  const results = await searchSalaryAggregates({ country, role: roleName });
  if (results.length === 0) notFound();
  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Salaries", href: "/salaries" },
          { label: roleName },
        ]}
      />
      <PageHeading
        eyebrow="Salary aggregate"
        title={`${roleName} pay in ${country.toUpperCase()}`}
        description="Only approved, sufficiently similar contributions are represented. Values are estimates, not individual records."
      />
      <div className="aggregate-grid">
        {results.map((aggregate) => (
          <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
        ))}
      </div>
    </div>
  );
}
