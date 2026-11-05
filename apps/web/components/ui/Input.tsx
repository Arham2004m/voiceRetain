import { useId, type InputHTMLAttributes, type Ref } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  hint?: string;
  id?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ label, error, hint, id, className = "", ref, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={`${inputId}-hint`} className="text-ink-soft text-sm">
          {hint}
        </p>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`bg-paper placeholder:text-ink-soft/70 min-h-12 border-2 px-3 text-base ${
          error ? "border-kumkum" : "border-ink"
        } ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-kumkum text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> {
  label: string;
  note?: string;
  id?: string;
}

export function Checkbox({ label, note, id, className = "", ...props }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          className={`accent-ink mt-0.5 size-6 shrink-0 cursor-pointer ${className}`}
          aria-describedby={note ? `${inputId}-note` : undefined}
          {...props}
        />
        <span>{label}</span>
      </label>
      {note ? (
        <p id={`${inputId}-note`} className="text-ink-soft pl-9 text-sm">
          {note}
        </p>
      ) : null}
    </div>
  );
}
