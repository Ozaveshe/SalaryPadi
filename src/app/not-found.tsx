import Link from "next/link";

export default function NotFound() {
  return (
    <div className="site-shell stack-lg">
      <header>
        <p className="eyebrow">Not found</p>
        <h1 className="page-title">This page is no longer available.</h1>
        <p className="lede">
          A job may have expired or the link may be incomplete. Search the
          current listings instead.
        </p>
      </header>
      <div className="cluster">
        <Link className="button" href="/jobs">
          Search current jobs
        </Link>
        <Link className="button button-secondary" href="/">
          Go home
        </Link>
      </div>
    </div>
  );
}
