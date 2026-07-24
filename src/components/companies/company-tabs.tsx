import Link from "next/link";

export function CompanyTabs({ slug }: { slug: string }) {
  const links = [
    ["Overview", `/companies/${slug}`],
    ["Jobs", `/companies/${slug}/jobs`],
    ["Salaries", `/companies/${slug}/salaries`],
    ["Reviews", `/companies/${slug}/reviews`],
    ["Benefits", `/companies/${slug}/benefits`],
    ["Interviews", `/companies/${slug}/interviews`],
  ] as const;
  return (
    <nav className="cluster" aria-label="Company intelligence">
      {links.map(([label, href]) => (
        <Link className="nav-link" href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
