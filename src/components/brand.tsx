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
        strokeWidth="3.4"
      >
        <path d="M17.5 34.5 V13.5 L30.5 34.5 V13.5" />
        <path d="M12.5 20.5 H35.5" />
        <path d="M12.5 27.5 H35.5" />
      </g>
      <circle cx="38.4" cy="9.6" r="3.1" fill="#eec75f" />
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
