import type { FormConfig, FormField, FormStored } from '../../api/types';
import { t } from '../../i18n';
import { DEFAULT_SURFACE } from '../design/defaults';
import { Check, FIELD_KEY_RE, isEmail, LIMITS, validateSurface } from '../design/rules';
import type { Errors } from '../design/rules';

export type FieldType = FormField['type'];
export const FIELD_TYPES: FieldType[] = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox'];
export const MAX_FIELDS = 20;
export const MAX_RECIPIENTS = 10;

/** Same defaults as backend `_default_fields()`; the /contact legacy adapter relies on these keys. */
export function defaultForm(recipient = ''): FormConfig {
  return {
    name: t('forms.default_name'),
    enabled: true,
    fields: [
      { key: 'name', label: t('forms.f.name'), type: 'text', required: true, max_length: 120, options: [] },
      { key: 'email', label: 'Email', type: 'email', required: true, max_length: 254, options: [] },
      { key: 'phone', label: t('forms.f.phone'), type: 'tel', required: false, max_length: 50, options: [] },
      { key: 'message', label: t('forms.f.message'), type: 'textarea', required: true, max_length: 3000, options: [] },
    ],
    recipients: recipient ? [recipient] : [],
    subject: '',
    submit_label: t('forms.default_submit'),
    success_message: t('forms.default_success'),
    privacy_text: '',
    privacy_required: false,
    privacy_url: null,
    autoresponder: {
      enabled: false,
      subject: t('forms.default_ar_subject'),
      body: t('forms.default_ar_body'),
    },
    surface: { ...DEFAULT_SURFACE },
  };
}

export function formFromStored(stored: FormStored): FormConfig {
  const { form_id, created_at, updated_at, ...config } = stored;
  return config;
}

export function uniqueKey(fields: FormField[], base = 'campo'): string {
  const taken = new Set(fields.map((f) => f.key));
  for (let i = 1; ; i++) {
    const key = `${base}_${i}`;
    if (!taken.has(key)) return key;
  }
}

export function validateForm(c: FormConfig): Errors {
  const k = new Check();
  k.text('name', c.name, LIMITS.short, { required: true });
  k.text('subject', c.subject, LIMITS.short);
  k.text('submit_label', c.submit_label, LIMITS.short);
  k.text('success_message', c.success_message, LIMITS.medium);
  k.text('privacy_text', c.privacy_text, LIMITS.medium);
  k.url('privacy_url', c.privacy_url);

  const fields = c.fields ?? [];
  if (fields.length < 1 || fields.length > MAX_FIELDS) k.fail('fields', t('forms.fields_count', { max: MAX_FIELDS }));
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    const p = `fields.${i}`;
    if (!FIELD_KEY_RE.test(f.key)) k.fail(`${p}.key`, t('forms.key_rule'));
    else if (seen.has(f.key)) k.fail(`${p}.key`, t('forms.key_dup'));
    seen.add(f.key);
    k.text(`${p}.label`, f.label, LIMITS.short, { required: true });
    k.text(`${p}.placeholder`, f.placeholder ?? '', LIMITS.short);
    k.range(`${p}.max_length`, f.max_length, 1, 5000);
    const options = f.options ?? [];
    if (options.length > 20 || options.some((o) => o.length > LIMITS.short)) k.fail(`${p}.options`, t('forms.options_rule'));
    if (f.type === 'select' && options.length === 0) k.fail(`${p}.options`, t('err.missing_options'));
  });

  if (c.recipients.length < 1) k.fail('recipients', t('forms.recipients_required'));
  else if (c.recipients.length > MAX_RECIPIENTS) k.fail('recipients', t('tags.max', { n: MAX_RECIPIENTS }));
  else if (c.recipients.some((r) => !isEmail(r))) k.fail('recipients', t('rules.email'));

  const ar = c.autoresponder;
  if (ar) {
    k.text('autoresponder.subject', ar.subject, LIMITS.short);
    k.text('autoresponder.body', ar.body, LIMITS.long);
    if (ar.enabled && !fields.some((f) => f.type === 'email')) k.fail('autoresponder.enabled', t('err.autoresponder_needs_email'));
  }
  k.merge('surface', validateSurface(c.surface ?? DEFAULT_SURFACE));
  return k.errors;
}
