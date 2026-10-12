import { useEffect, useId, useState } from 'preact/hooks';
import { t } from '../i18n';

/** Mirrors the server rule: `#RRGGBB` or `#RRGGBBAA`. */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
export const isHexColor = (v: string): boolean => HEX_COLOR.test(v);

interface Props {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

/** Native color picker + hex text field. Only valid values are emitted; invalid text shows an error. */
export function ColorField({ label, value, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(value);
  const valid = isHexColor(text);

  useEffect(() => setText(value), [value]);

  const accept = (raw: string): void => {
    const v = raw.startsWith('#') ? raw : `#${raw}`;
    setText(v);
    if (isHexColor(v)) onChange(v.toLowerCase());
  };

  return (
    <div class={`field color-field${valid ? '' : ' has-error'}`}>
      <label htmlFor={id}>{label}</label>
      <div class="color-row">
        <input
          type="color"
          class="color-swatch"
          aria-label={`${label} (picker)`}
          value={valid ? text.slice(0, 7) : value.slice(0, 7)}
          onInput={(e) => accept(e.currentTarget.value)}
        />
        <input
          id={id}
          class="mono"
          value={text}
          maxLength={9}
          spellcheck={false}
          aria-invalid={!valid || undefined}
          aria-describedby={valid ? undefined : `${id}-e`}
          onInput={(e) => accept(e.currentTarget.value.trim())}
        />
      </div>
      {!valid && (
        <p class="field-error" id={`${id}-e`} role="alert">
          {t('color.invalid')}
        </p>
      )}
    </div>
  );
}
