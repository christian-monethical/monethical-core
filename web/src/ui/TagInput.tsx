import { useId, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Icon } from './Icon';

interface Props {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Turn raw input into its canonical form (e.g. strip scheme, lowercase). */
  normalize?: (raw: string) => string;
  /** Return an error message, or null when the (normalized) value is acceptable. */
  validate?: (value: string) => string | null;
  max?: number;
  hint?: string;
  placeholder?: string;
  error?: string;
}

const SEPARATORS = /[\s,;]+/;

/** Chips input: Enter, comma, space or blur add; Backspace on empty input removes the last chip. */
export function TagInput({ label, values, onChange, normalize = (v) => v.trim(), validate, max, hint, placeholder, error }: Props) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const normalizedDraft = draft.trim() ? normalize(draft) : '';
  const rewritten = normalizedDraft !== '' && normalizedDraft !== draft.trim();

  function commit(raw: string): boolean {
    const parts = raw.split(SEPARATORS).filter(Boolean);
    if (parts.length === 0) return true;
    const next = [...values];
    for (const part of parts) {
      const value = normalize(part);
      const err = value ? validate?.(value) : null;
      if (err) {
        setProblem(err);
        onChange(next);
        return false;
      }
      if (max !== undefined && next.length >= max) {
        setProblem(t('tags.max', { n: max }));
        onChange(next);
        return false;
      }
      if (value && !next.includes(value)) next.push(value);
    }
    setProblem(null);
    onChange(next);
    return true;
  }

  const shownError = problem ?? error;
  return (
    <div class={`field${shownError ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div class="tags">
        {values.map((v) => (
          <span class="tag" key={v}>
            {v}
            <button
              type="button"
              aria-label={t('tags.remove', { v })}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={values.length === 0 ? placeholder : undefined}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={`${id}-h`}
          autoCapitalize="off"
          autoCorrect="off"
          spellcheck={false}
          onInput={(e) => {
            const v = e.currentTarget.value;
            if (/[\s,;]$/.test(v) && v.trim()) {
              if (commit(v)) setDraft('');
              else setDraft(v.trim());
            } else {
              setDraft(v);
              setProblem(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (commit(draft)) setDraft('');
            } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim() && commit(draft)) setDraft('');
          }}
        />
      </div>
      <p class={shownError ? 'field-error' : 'field-hint'} id={`${id}-h`} role={shownError ? 'alert' : undefined}>
        {shownError ?? (rewritten ? t('tags.will_save_as', { v: normalizedDraft }) : hint)}
      </p>
    </div>
  );
}
