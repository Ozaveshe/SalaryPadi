import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand-mark" href="/" aria-label="SalaryPadi home">
      <span className="brand-dot" aria-hidden="true">
        SP
      </span>
      <span>SalaryPadi</span>
    </Link>
  );
}
