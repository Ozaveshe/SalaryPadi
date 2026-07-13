import type { SalaryCellProgress } from "@/lib/salaries/progress";
import { salaryProgressCopy } from "@/lib/salaries/progress";

export function SalaryProgress({ progress }: { progress: SalaryCellProgress }) {
  const copy = salaryProgressCopy(progress);
  return (
    <div className="notice" aria-label="Salary publication progress">
      <strong>{copy.heading}</strong>
      <p className="m-0">{copy.detail}</p>
    </div>
  );
}
