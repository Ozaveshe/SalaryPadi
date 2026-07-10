import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";

export function ContributionShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="reading-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Contribute", href: "/contribute" },
          { label: title },
        ]}
      />
      <PageHeading
        eyebrow="Private contribution"
        title={title}
        description={description}
      />
      <div className="notice">
        <strong>Moderated, not auto-published.</strong> Your account link
        remains private and is used for ownership, deletion and abuse controls.
        Employers never receive it.
      </div>
      {children}
    </div>
  );
}
