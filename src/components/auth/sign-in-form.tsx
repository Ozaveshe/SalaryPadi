"use client";

import { useRef, useState, type FormEvent } from "react";

export function SignInForm({
  disabled,
  next,
}: {
  disabled: boolean;
  next: string;
}) {
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitting.current) {
      event.preventDefault();
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
  }

  return (
    <form
      className="surface surface-pad stack"
      action="/api/auth/sign-in"
      method="post"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          required
        />
        <p className="field-help">
          Used for authentication and account notices—not public contributions.
        </p>
      </div>
      <button
        className="button w-fit"
        type="submit"
        disabled={disabled || isSubmitting}
      >
        {isSubmitting ? "Sending sign-in link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
