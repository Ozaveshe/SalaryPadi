"use client";

import type { SelectHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

interface AutoSubmitSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  pendingLabel: string;
}

/**
 * A progressively-enhanced select for lightweight GET forms.
 *
 * With JavaScript it submits as soon as the choice changes. Without
 * JavaScript, the adjacent submit button remains available. `useFormStatus`
 * connects the control to Next's client-side form navigation without local
 * loading state or an effect that can drift from the router.
 */
export function AutoSubmitSelect({
  children,
  className,
  pendingLabel,
  ...props
}: AutoSubmitSelectProps) {
  const { pending } = useFormStatus();

  return (
    <>
      <select
        {...props}
        aria-busy={pending || undefined}
        className={className}
        onChange={(event) => {
          props.onChange?.(event);
          if (!event.defaultPrevented)
            event.currentTarget.form?.requestSubmit();
        }}
      >
        {children}
      </select>
      <span
        aria-live="polite"
        className="auto-submit-status"
        data-pending={pending ? "true" : undefined}
      >
        {pending ? pendingLabel : "Updates automatically"}
      </span>
      <noscript>
        <button className="button button-quiet" type="submit">
          Apply
        </button>
      </noscript>
    </>
  );
}
