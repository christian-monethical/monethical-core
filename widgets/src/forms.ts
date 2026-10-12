/** Contact form widget (`data-monethical-widget="contact-form"`). */
import { ApiError, apiFor, type Api } from './api';
import { emit, h, mountShadow, uid, type Shadow } from './dom';
import { applyTokens } from './tokens';
import { ERR, pageLang, type Dict, type Lang } from './i18n';
import { errText, parseServerErrors, validateField } from './fields';
import type { Boot, FormField, PublicForm, SiteDoc } from './types';
import {
  BASE_CSS,
  describeError,
  errorSlot,
  fieldBox,
  honeypot,
  privacyRow,
  setBusy,
  setError,
  showStatus,
  statusRegion,
  type FieldBox,
} from './ui';

const T: Dict<'send'> = {
  it: { send: 'Invia' },
  en: { send: 'Send' },
  de: { send: 'Senden' },
  fr: { send: 'Envoyer' },
  es: { send: 'Enviar' },
};

interface Entry {
  field: FormField;
  value(): string | boolean;
  box: FieldBox;
}

const AUTOCOMPLETE: Partial<Record<string, string>> = { email: 'email', tel: 'tel', name: 'name' };

function control(f: FormField): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const common = { name: f.key, maxlength: f.max_length, placeholder: f.placeholder };
  if (f.type === 'textarea') return h('textarea', { ...common, rows: 4 });
  if (f.type === 'select') {
    return h('select', { name: f.key }, h('option', { value: '' }, f.placeholder ?? '—'), ...f.options.map((o) => h('option', { value: o }, o)));
  }
  return h('input', { ...common, type: f.type, autocomplete: AUTOCOMPLETE[f.type] ?? AUTOCOMPLETE[f.key] });
}

function entryFor(f: FormField, id: string): Entry {
  if (f.type === 'checkbox') {
    const input = h('input', { type: 'checkbox', name: f.key, id });
    const slot = errorSlot(id);
    if (f.required) input.setAttribute('aria-required', 'true');
    const el = h('div', { class: 'f' }, h('label', { class: 'opt', for: id }, input, h('span', null, f.label)), slot);
    return { field: f, value: () => input.checked, box: { el, control: input, setError: (m) => { setError(slot, [input], m); } } };
  }
  const ctl = control(f);
  return { field: f, value: () => ctl.value, box: fieldBox(id, f.label, ctl, f.required) };
}

/** Render the form into `parent`; used by the loader and by the console preview. */
export function mountForm(parent: Node, form: PublicForm, api: Api, lang: Lang): Shadow {
  const shadow = mountShadow(parent, BASE_CSS);
  applyTokens(shadow.holder, form.surface);
  const id = uid();
  const entries = form.fields.map((f, i) => entryFor(f, `${id}-${i}`));
  const privacy = form.privacy_text
    ? privacyRow(`${id}-p`, form.privacy_text, form.privacy_url, lang, form.privacy_required)
    : null;
  const trap = honeypot();
  const submit = h('button', { type: 'submit', class: 'btn' }, form.submit_label || T[lang].send);
  const status = statusRegion();
  const el = h('form', { class: 'w', novalidate: true }, ...entries.map((e) => e.box.el), privacy?.el, trap.el, submit, status);
  shadow.root.appendChild(el);

  const firstInvalid = (): HTMLElement | undefined => {
    const bad = [...entries.map((e) => e.box), privacy?.box].find((b) => b?.control.getAttribute('aria-invalid') === 'true');
    return bad?.control;
  };

  const check = (): boolean => {
    for (const e of entries) {
      const code = validateField(e.field, e.value());
      e.box.setError(code && errText(lang, code));
    }
    const consentMissing = Boolean(privacy && form.privacy_required && !privacy.input.checked);
    privacy?.box.setError(consentMissing ? ERR[lang].required : null);
    return firstInvalid() === undefined;
  };

  const applyServer = (err: ApiError): boolean => {
    const codes = parseServerErrors(err);
    let matched = false;
    for (const e of entries) {
      const code = codes[e.field.key];
      if (code) {
        e.box.setError(errText(lang, code));
        matched = true;
      }
    }
    if (codes.privacy && privacy) {
      privacy.box.setError(ERR[lang].required);
      matched = true;
    }
    return matched;
  };

  el.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    showStatus(status, '', false);
    if (!check()) {
      firstInvalid()?.focus();
      return;
    }
    const data: Record<string, string | boolean> = {};
    for (const e of entries) {
      const v = e.value();
      data[e.field.key] = typeof v === 'string' ? v.trim() : v;
    }
    setBusy(submit, true);
    api
      .post(`/forms/${encodeURIComponent(form.form_id)}/submit`, {
        data,
        privacy: privacy?.input.checked ?? false,
        website: trap.input.value,
      })
      .then(() => {
        el.replaceChildren(status);
        showStatus(status, form.success_message, false);
        status.focus();
        emit('monethical:submit', { widget: 'contact-form', id: form.form_id });
      })
      .catch((err: unknown) => {
        setBusy(submit, false);
        if (err instanceof ApiError && err.code === 'invalid_submission' && applyServer(err)) {
          firstInvalid()?.focus();
          return;
        }
        showStatus(status, describeError(err, lang), true);
      });
  });
  return shadow;
}

export function mount(el: HTMLElement, doc: SiteDoc, boot: Boot): void {
  const wanted = el.dataset.formId;
  const form = doc.forms.find((f) => f.form_id === wanted) ?? (wanted ? undefined : doc.forms[0]);
  if (form) mountForm(el, form, apiFor(boot), pageLang(doc.banner?.language));
}
