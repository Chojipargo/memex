import type { ReactNode } from "react";

type FieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "email" | "text";
  error?: string;
  hint?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  action?: ReactNode;
  disabled?: boolean;
};

export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  inputMode,
  error,
  hint,
  icon,
  trailing,
  action,
  disabled,
}: FieldProps) {
  const describedBy = error
    ? `${id}-error`
    : hint
      ? `${id}-hint`
      : undefined;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[12.5px] font-medium tracking-[-0.005em] text-neutral-300"
        >
          {label}
        </label>
        {action}
      </div>

      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
            {icon}
          </span>
        ) : null}

        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`field-control${icon ? " has-icon" : ""}${trailing ? " has-trailing" : ""}`}
        />

        {trailing ? (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            {trailing}
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1.5 text-[12px] leading-4 text-red-300/90"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] leading-4 text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
