import { AFRICAN_APPLICANT_COUNTRIES } from "@/lib/jobs/eligibility";

export function ApplicantCountrySelect({
  id,
  defaultValue = "",
  required = false,
}: {
  id: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>I work from</label>
      <select
        className="select"
        id={id}
        name="applicantCountry"
        defaultValue={defaultValue}
        required={required}
      >
        <option value="">
          {required ? "Choose your country" : "Browse across Africa"}
        </option>
        {AFRICAN_APPLICANT_COUNTRIES.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
