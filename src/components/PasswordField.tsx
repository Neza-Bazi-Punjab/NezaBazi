/* Password input with a show/hide toggle, styled like the other form fields.

   Riders type these on a phone, one-handed, often with a second language and
   an autocorrecting keyboard — so being able to check what was actually typed
   is the difference between signing in and guessing at a rejected password.
   The toggle starts hidden, so nothing is revealed without a deliberate tap. */
"use client";

import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

/* Everything a caller could set on the underlying input except `type`, which
   this component owns — that is the whole point of it. */
type PasswordFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label: string;
};

export default function PasswordField({
  label,
  id,
  className,
  disabled,
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const action = visible ? "Hide password" : "Show password";

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink"
      >
        {label}
      </label>

      <div className="relative mt-2">
        <input
          {...inputProps}
          id={fieldId}
          type={visible ? "text" : "password"}
          disabled={disabled}
          /* pr-14 keeps the text clear of the toggle. Long passwords scroll
             under it rather than sitting behind it. */
          className={
            className ??
            "w-full rounded-lg border border-bronze/20 bg-sand py-3 pl-4 pr-14 text-brown focus:border-bronze focus:outline-none disabled:opacity-60"
          }
        />

        {/* type="button" — inside a form, the default would submit it. */}
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          disabled={disabled}
          aria-label={action}
          aria-controls={fieldId}
          title={action}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-brown/70 transition-colors hover:text-bronze focus:text-bronze focus:outline-none disabled:opacity-60"
        >
          {visible ? (
            <EyeOffIcon className="h-5 w-5" />
          ) : (
            <EyeIcon className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
