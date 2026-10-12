import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  /** Live character counter: `[current, max]`. */
  counter?: [number, number];
  required?: boolean;
  class?: string;
  children: (a11y: { id: string; describedBy: string | undefined; invalid: boolean }) => ComponentChildren;
}

/** Label + control + hint/error/counter with correct aria wiring. */
export function Field({ label, hint, error, counter, required, class: cls, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-h`;
  const errId = `${id}-e`;
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  const near = counter && counter[0] > counter[1] * 0.9;
  return (
    <div class={`field${error ? ' has-error' : ''}${cls ? ` ${cls}` : ''}`}>
      <div class="field-head">
        <label htmlFor={id}>
          {label}
          {required && (
            <span class="req" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
        {counter && (
          <span class={`counter${near ? ' is-near' : ''}`} aria-hidden="true">
            {counter[0]}/{counter[1]}
          </span>
        )}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p class="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p class="field-error" id={errId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = Omit<FieldShellProps, 'children' | 'counter'>;

type InputEvent<E extends HTMLElement> = Event & { currentTarget: E };

/** The subset of native input attributes the console actually uses. */
interface InputExtras {
  type?: 'text' | 'email' | 'url' | 'date' | 'search' | 'tel';
  placeholder?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
  readOnly?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  mono?: boolean;
  maxLength?: number;
  'data-autofocus'?: boolean;
  onInput: (e: InputEvent<HTMLInputElement>) => void;
}

export function TextInput({
  label,
  hint,
  error,
  required,
  maxLength,
  class: cls,
  value,
  onInput,
  type = 'text',
  mono,
  ...rest
}: Common & InputExtras & { value: string; class?: string }) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      class={cls}
      counter={maxLength ? [value.length, Number(maxLength)] : undefined}
    >
      {({ id, describedBy, invalid }) => (
        <input
          {...rest}
          id={id}
          // Preact types `type` as a discriminated union per input kind; ours is a plain subset.
          type={type as 'date'}
          class={mono ? 'mono' : undefined}
          value={value}
          onInput={onInput}
          maxLength={maxLength}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  required,
  maxLength,
  class: cls,
  value,
  onInput,
  rows = 3,
  ...rest
}: Common & { value: string; class?: string; maxLength?: number; rows?: number; onInput: (e: InputEvent<HTMLTextAreaElement>) => void }) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      class={cls}
      counter={maxLength ? [value.length, Number(maxLength)] : undefined}
    >
      {({ id, describedBy, invalid }) => (
        <textarea
          {...rest}
          id={id}
          rows={rows}
          value={value}
          onInput={onInput}
          maxLength={maxLength}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </Field>
  );
}

export interface Option<V extends string> {
  value: V;
  label: string;
}

export function Select<V extends string>({
  label,
  hint,
  error,
  value,
  options,
  onChange,
  class: cls,
  disabled,
}: Common & {
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error} class={cls}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.currentTarget.value as V)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function NumberInput({
  label,
  hint,
  error,
  value,
  onChange,
  min,
  max,
  step = 1,
  class: cls,
}: Common & { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <Field label={label} hint={hint} error={error} class={cls}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onInput={(e) => onChange(e.currentTarget.valueAsNumber)}
        />
      )}
    </Field>
  );
}
