import { useId } from 'preact/hooks';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Toggle with role=switch; keyboard operable (Space/Enter via the native button). */
export function Switch({ checked, onChange, label, hint, disabled }: Props) {
  const id = useId();
  return (
    <div class="switch-row">
      <div class="switch-text">
        <span id={`${id}-l`}>{label}</span>
        {hint && <small id={`${id}-h`}>{hint}</small>}
      </div>
      <button
        type="button"
        role="switch"
        class="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={hint ? `${id}-h` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span class="switch-knob" />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, hint, disabled }: Props) {
  const id = useId();
  return (
    <div class="check-row">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-h` : undefined}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <label htmlFor={id}>
        {label}
        {hint && <small id={`${id}-h`}>{hint}</small>}
      </label>
    </div>
  );
}
