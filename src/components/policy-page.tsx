import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";

export function PolicyPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="reading-shell stack-lg">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} />
      <PageHeading eyebrow={eyebrow} title={title} description={description} />
      <div className="rich-copy">{children}</div>
    </article>
  );
}
