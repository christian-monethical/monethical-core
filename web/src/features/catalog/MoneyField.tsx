import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { TextInput } from '../../ui/Field';
import { centsToInput, MAX_CENTS, parseMoney } from './model';

interface Props {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
  error?: string;
  hint?: string;
}

/** Euro amount typed as "12,50" and stored as integer cents. */
export function MoneyField({ label, cents, onChange, error, hint }: Props) {
  const [text, setText] = useState(centsToInput(cents));
  useEffect(() => {
    if (parseMoney(text) !== cents) setText(centsToInput(cents));
  }, [cents]);
  const parsed = parseMoney(text);
  const invalid = Number.isNaN(parsed) || parsed > MAX_CENTS;
  return (
    <TextInput
      label={`${label} (EUR)`}
      inputMode="decimal"
      value={text}
      hint={hint}
      error={error ?? (invalid ? t('catalog.money_rule') : undefined)}
      onInput={(e) => {
        const v = e.currentTarget.value;
        setText(v);
        const c = parseMoney(v);
        if (!Number.isNaN(c)) onChange(c);
      }}
    />
  );
}
