/** Building blocks shared by the form-like widgets (forms, newsletter, survey, booking). */
import { ApiError } from './api';
import { h, safeUrl } from './dom';
import { ERR, type Lang } from './i18n';

export const BASE_CSS = `
:host{display:block}
*,*::before,*::after{box-sizing:border-box}
.w{font:15px/1.5 var(--font);color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);box-shadow:var(--sh);padding:var(--pad);max-width:640px;margin:0 auto}
h3{margin:0 0 4px;font-size:1.25em}
p{margin:0 0 12px}
.mu{color:var(--mu)}
.f{margin:0 0 14px;border:0;padding:0;min-width:0}
.f>label,.f>legend{display:block;font-weight:600;font-size:.9em;margin:0 0 6px;padding:0}
input,textarea,select{width:100%;font:inherit;color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:var(--r2);padding:10px 12px;min-height:42px}
textarea{min-height:96px;resize:vertical}
input[type=checkbox],input[type=radio]{width:18px;height:18px;min-height:0;margin:0;accent-color:var(--ac);flex:none}
:focus-visible{outline:2px solid var(--fc);outline-offset:2px}
[aria-invalid]{border-color:#b3261e}
.err{color:#b3261e;font-size:.85em;margin:4px 0 0}
.opt{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin:4px 0}
.btn{font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--ac);background:var(--ac);color:var(--at);border-radius:var(--r2);padding:10px 18px;min-height:42px}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.status{margin:12px 0 0;font-weight:500}
.bad{color:#b3261e}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
a{color:var(--tx)}
@media (forced-colors:active){.btn{border:2px solid ButtonText}}
`;

export function errorSlot(id: string): HTMLParagraphElement {
  return h('p', { id: `${id}-e`, class: 'err', hidden: true });
}

/** Show/clear an error and wire aria-invalid / aria-describedby on the targets. */
export function setError(slot: HTMLElement, targets: HTMLElement[], message: string | null): void {
  slot.hidden = message === null;
  slot.textContent = message ?? '';
  for (const t of targets) {
    if (message === null) {
      t.removeAttribute('aria-invalid');
      t.removeAttribute('aria-describedby');
    } else {
      t.setAttribute('aria-invalid', 'true');
      t.setAttribute('aria-describedby', slot.id);
    }
  }
}

export interface FieldBox {
  el: HTMLElement;
  control: HTMLElement;
  setError: (message: string | null) => void;
}

export function fieldBox(id: string, label: string, control: HTMLElement, required: boolean): FieldBox {
  control.id = id;
  if (required) control.setAttribute('aria-required', 'true');
  const slot = errorSlot(id);
  const el = h(
    'div',
    { class: 'f' },
    h('label', { for: id }, label, required && h('span', { 'aria-hidden': 'true' }, ' *')),
    control,
    slot,
  );
  return { el, control, setError: (m) => { setError(slot, [control], m); } };
}

export interface Honeypot {
  el: HTMLElement;
  input: HTMLInputElement;
}

/** Hidden trap for bots: humans never see or tab to it. */
export function honeypot(): Honeypot {
  const input = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
  return { el: h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', null, 'Website', input)), input };
}

export interface Privacy {
  el: HTMLElement;
  input: HTMLInputElement;
  box: FieldBox;
}

/** Consent checkbox with optional https policy link. */
export function privacyRow(id: string, text: string, url: string | null, lang: Lang, required: boolean): Privacy {
  const input = h('input', { type: 'checkbox' });
  const href = safeUrl(url);
  const link = href && h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, ERR[lang].privacy);
  const slot = errorSlot(id);
  input.id = id;
  if (required) input.setAttribute('aria-required', 'true');
  const el = h('div', { class: 'f' }, h('label', { class: 'opt', for: id }, input, h('span', null, text, link && ' ', link)), slot);
  return { el, input, box: { el, control: input, setError: (m) => { setError(slot, [input], m); } } };
}

export function statusRegion(): HTMLElement {
  return h('div', { class: 'status', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
}

export function showStatus(region: HTMLElement, message: string, bad: boolean): void {
  region.className = bad ? 'status bad' : 'status';
  region.textContent = message;
}

export function setBusy(btn: HTMLButtonElement, busy: boolean): void {
  btn.disabled = busy;
  if (busy) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
}

/** Friendly text for a failed request (429, network, anything else). */
export function describeError(err: unknown, lang: Lang): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return ERR[lang].rate;
    if (err.status === 0) return ERR[lang].network;
  }
  return ERR[lang].generic;
}
