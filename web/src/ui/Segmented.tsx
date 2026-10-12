import { useId } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface SegOption<V extends string> {
  value: V;
  label: ComponentChildren;
  /** Accessible name when `label` is an icon. */
  title?: string;
}

interface Props<V extends string> {
  label: string;
  value: V;
  options: SegOption<V>[];
  onChange: (v: V) => void;
  hideLabel?: boolean;
}

/** Radio-group segmented control with arrow-key navigation (roving tabindex). */
export function Segmented<V extends string>({ label, value, options, onChange, hideLabel }: Props<V>) {
  const id = useId();
  const move = (index: number, delta: number): void => {
    const next = options[(index + delta + options.length) % options.length];
    if (next) {
      onChange(next.value);
      document.getElementById(`${id}-${next.value}`)?.focus();
    }
  };
  return (
    <div class="field">
      {!hideLabel && (
        <span class="field-label" id={`${id}-l`}>
          {label}
        </span>
      )}
      <div
        class="segmented"
        role="radiogroup"
        aria-label={hideLabel ? label : undefined}
        aria-labelledby={hideLabel ? undefined : `${id}-l`}
      >
        {options.map((o, i) => (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            role="radio"
            title={o.title}
            aria-label={o.title}
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            class={o.value === value ? 'is-on' : ''}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
