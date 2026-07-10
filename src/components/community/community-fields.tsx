import type {
  CommunityProfile,
  NigeriaState,
} from "@/lib/community/repository";

export function CommunityIdentityFields({
  idPrefix,
  profile,
  states,
}: {
  idPrefix: string;
  profile: CommunityProfile | null;
  states: NigeriaState[];
}) {
  return (
    <div className="community-identity-fields">
      <div className="field">
        <label htmlFor={`${idPrefix}-display-name`}>Public name</label>
        <input
          className="input"
          id={`${idPrefix}-display-name`}
          name="display_name"
          defaultValue={profile?.displayName ?? ""}
          minLength={2}
          maxLength={60}
          autoComplete="nickname"
          placeholder="e.g. Ada Career"
          required
        />
        <p className="field-help">
          Shown publicly with a random SalaryPadi handle. Your account email is
          never shown.
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-state`}>State relevance</label>
        <select
          className="select"
          id={`${idPrefix}-state`}
          name="state_code"
          defaultValue={profile?.stateCode ?? ""}
        >
          <option value="">Nationwide / not state-specific</option>
          {states.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
