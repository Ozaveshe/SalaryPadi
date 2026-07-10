"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <div className="site-shell stack-lg" role="alert">
      <header>
        <p className="eyebrow">Something went wrong</p>
        <h1 className="page-title">We could not finish that request.</h1>
        <p className="lede">
          Your private form values have not been sent to analytics. Try once
          more, or return to the previous page.
        </p>
      </header>
      <div>
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
