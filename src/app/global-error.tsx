"use client";

import "./globals.css";

/**
 * Last-resort boundary: this replaces the root layout when the layout itself
 * fails, so it must render its own <html> and <body>. Before this file
 * existed, a root-layout failure fell through to Next's unstyled default —
 * the one state where the product shell disappeared entirely. No error
 * detail is rendered: a root failure must not become a public stack trace.
 */
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="site-shell stack-lg" role="alert">
          <header>
            <p className="eyebrow">SalaryPadi</p>
            <h1 className="page-title">Something went wrong.</h1>
            <p className="lede">
              The page could not be rendered. Nothing you entered has been sent
              anywhere. Try again, or return to the homepage.
            </p>
          </header>
          <div className="cluster">
            <button
              className="button"
              type="button"
              onClick={() => unstable_retry()}
            >
              Try again
            </button>
            <a className="button button-secondary" href="/">
              Go to the homepage
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
