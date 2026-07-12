import {
  BENEFIT_FIELDS,
  COST_FIELDS,
  type OfferPrefix,
} from "./offer-compare-form";

export function OfferFields({
  prefix,
  title,
  defaultCurrency,
}: {
  prefix: OfferPrefix;
  title: string;
  defaultCurrency: string;
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${prefix}_label`}>Offer label</label>
          <input
            className="input"
            id={`${prefix}_label`}
            name={`${prefix}_label`}
            defaultValue={title}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_base`}>Base pay</label>
          <input
            className="input"
            id={`${prefix}_base`}
            name={`${prefix}_base`}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_currency`}>Currency</label>
          <input
            className="input"
            id={`${prefix}_currency`}
            name={`${prefix}_currency`}
            pattern="[A-Za-z]{3}"
            maxLength={3}
            defaultValue={defaultCurrency}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_period`}>Pay period</label>
          <select
            className="select"
            id={`${prefix}_period`}
            name={`${prefix}_period`}
            defaultValue="monthly"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_periods_per_year`}>
            Paid periods/year
          </label>
          <input
            className="input"
            id={`${prefix}_periods_per_year`}
            name={`${prefix}_periods_per_year`}
            type="number"
            min="1"
            step="1"
          />
          <p className="field-help">Required for hourly or daily pay.</p>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_basis`}>Amount is</label>
          <select
            className="select"
            id={`${prefix}_basis`}
            name={`${prefix}_basis`}
          >
            <option value="gross">Gross</option>
            <option value="net">Net</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_bonus`}>Annual bonus</label>
          <input
            className="input"
            id={`${prefix}_bonus`}
            name={`${prefix}_bonus`}
            type="number"
            min="0"
            step="0.01"
          />
        </div>
        <label className="checkbox">
          <input type="checkbox" name={`${prefix}_bonus_guaranteed`} />
          Bonus is guaranteed
        </label>
        <div className="field">
          <label htmlFor={`${prefix}_commission`}>Annual commission</label>
          <input
            className="input"
            id={`${prefix}_commission`}
            name={`${prefix}_commission`}
            type="number"
            min="0"
            step="0.01"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_deductions`}>
            Estimated monthly deductions
          </label>
          <input
            className="input"
            id={`${prefix}_deductions`}
            name={`${prefix}_deductions`}
            type="number"
            min="0"
            step="0.01"
          />
          <p className="field-help">
            Leave blank if unknown; enter 0 only when explicitly estimating
            zero.
          </p>
        </div>
      </div>
      <h3>Monthly benefit values</h3>
      <div className="form-grid">
        {BENEFIT_FIELDS.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={`${prefix}_${name}`}>{label}</label>
            <input
              className="input"
              id={`${prefix}_${name}`}
              name={`${prefix}_${name}`}
              type="number"
              min="0"
              step="0.01"
            />
          </div>
        ))}
      </div>
      <h3>Monthly personal work costs</h3>
      <div className="form-grid">
        {COST_FIELDS.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={`${prefix}_${name}`}>{label}</label>
            <input
              className="input"
              id={`${prefix}_${name}`}
              name={`${prefix}_${name}`}
              type="number"
              min="0"
              step="0.01"
            />
          </div>
        ))}
      </div>
      <h3>Terms</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${prefix}_arrangement`}>Arrangement</label>
          <select
            className="select"
            id={`${prefix}_arrangement`}
            name={`${prefix}_arrangement`}
          >
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
            <option value="freelance">Freelance</option>
            <option value="fixed_term">Fixed term</option>
            <option value="internship">Internship</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_work_mode`}>Work mode</label>
          <select
            className="select"
            id={`${prefix}_work_mode`}
            name={`${prefix}_work_mode`}
          >
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_leave`}>Paid leave days/year</label>
          <input
            className="input"
            id={`${prefix}_leave`}
            name={`${prefix}_leave`}
            type="number"
            min="0"
            step="1"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_commute_hours`}>Commute hours/week</label>
          <input
            className="input"
            id={`${prefix}_commute_hours`}
            name={`${prefix}_commute_hours`}
            type="number"
            min="0"
            step="0.5"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_contract_months`}>
            Contract term (months)
          </label>
          <input
            className="input"
            id={`${prefix}_contract_months`}
            name={`${prefix}_contract_months`}
            type="number"
            min="0"
            step="1"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_notice_days`}>Notice period (days)</label>
          <input
            className="input"
            id={`${prefix}_notice_days`}
            name={`${prefix}_notice_days`}
            type="number"
            min="0"
            step="1"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_equipment_list`}>Equipment provided</label>
          <input
            className="input"
            id={`${prefix}_equipment_list`}
            name={`${prefix}_equipment_list`}
            placeholder="Laptop, monitor"
          />
        </div>
      </div>
    </fieldset>
  );
}
