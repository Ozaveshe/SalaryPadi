import Link from "next/link";

/**
 * The SalaryPadi mark: a speech bubble — a padi (friend) talking — carrying
 * the naira sign. Inline so it inherits no external requests and stays crisp
 * at any size. Source of the exported logo set: scripts/generate-brand-assets.mjs.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="brand-logo"
      fill="none"
      height={size}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24 0 A24 24 0 0 1 48 24 A24 24 0 0 1 24 48 H5 A5 5 0 0 1 0 43 V24 A24 24 0 0 1 24 0 Z"
        fill="var(--brand-mark-fill, var(--interactive-primary))"
      />
      <g
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.6"
      >
        <path d="M18 33.5 V14.5 L30 33.5 V14.5" />
        <path d="M14.5 20.75 H33.5" />
        <path d="M14.5 27.25 H33.5" />
      </g>
      <path
        d="M38.5 4.6 C39.35 7.6 40.4 8.65 43.4 9.5 C40.4 10.35 39.35 11.4 38.5 14.4 C37.65 11.4 36.6 10.35 33.6 9.5 C36.6 8.65 37.65 7.6 38.5 4.6 Z"
        fill="#eec75f"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <Link className="brand-mark" href="/" aria-label="SalaryPadi home">
      <BrandMark />
      <span>
        Salary<span className="brand-accent">Padi</span>
      </span>
    </Link>
  );
}
