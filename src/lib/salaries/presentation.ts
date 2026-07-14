export function roundSalaryEstimate(amount: number, significantDigits = 2) {
  if (!Number.isFinite(amount)) throw new Error("invalid_salary_estimate");
  if (amount === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(amount)));
  const unit = 10 ** Math.max(0, magnitude - significantDigits + 1);
  return Math.round(amount / unit) * unit;
}
