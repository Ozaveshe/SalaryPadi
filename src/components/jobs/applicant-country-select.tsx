import { AFRICAN_APPLICANT_COUNTRIES } from "@/lib/jobs/eligibility";

export function ApplicantCountrySelect({
  id,
  defaultValue = "",
}: {
  id: string;
  defaultValue?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>I work from</label>
      <select
        className="select"
        id={id}
        name="applicantCountry"
        defaultValue={defaultValue}
      >
        <option value="">Browse across Africa</option>
        {AFRICAN_APPLICANT_COUNTRIES.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
