/** Newsletter signup widget (`data-monethical-widget="newsletter"`). */
import { apiFor, type Api } from './api';
import { emit, h, mountShadow, uid, type Shadow } from './dom';
import { applyTokens } from './tokens';
import { ERR, pageLang, type Lang } from './i18n';
import type { Boot, NewsletterConfig, SiteDoc } from './types';
import { BASE_CSS, describeError, fieldBox, honeypot, privacyRow, setBusy, showStatus, statusRegion } from './ui';
import { validateEmail } from './validate';

const CSS = `
.row{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
.row .f{flex:1 1 220px;margin:0}
.row .btn{flex:none}
`;

/** Render the signup form into `parent`; used by the loader and by the console preview. */
export function mountNewsletter(parent: Node, cfg: NewsletterConfig, api: Api, lang: Lang): Shadow {
  const shadow = mountShadow(parent, BASE_CSS + CSS);
  applyTokens(shadow.holder, cfg.surface);
  const id = uid();
  const heading = h('h3', { id: `${id}-t` }, cfg.headline);
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'email', maxlength: 254, placeholder: cfg.email_placeholder });
  const emailBox = fieldBox(`${id}-m`, cfg.email_placeholder || 'Email', email, true);
  emailBox.el.querySelector('label')?.classList.add('hp');
  const consent = privacyRow(`${id}-c`, cfg.privacy_text, cfg.privacy_url, lang, true);
  const trap = honeypot();
  const submit = h('button', { type: 'submit', class: 'btn' }, cfg.button_label);
  const status = statusRegion();
  const el = h(
    'form',
    { class: 'w', novalidate: true, 'aria-labelledby': `${id}-t` },
    heading,
    cfg.subheadline && h('p', { class: 'mu' }, cfg.subheadline),
    h('div', { class: 'row' }, emailBox.el, submit),
    consent.el,
    trap.el,
    status,
  );
  shadow.root.appendChild(el);

  el.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    showStatus(status, '', false);
    const code = validateEmail(email.value);
    emailBox.setError(code && ERR[lang][code]);
    consent.box.setError(consent.input.checked ? null : ERR[lang].required);
    if (code) return void email.focus();
    if (!consent.input.checked) return void consent.input.focus();
    const done = (): void => {
      el.replaceChildren(status);
      showStatus(status, cfg.success_message, false);
      status.focus();
      emit('monethical:submit', { widget: 'newsletter' });
    };
    if (trap.input.value) return done(); // bot: pretend success, send nothing
    setBusy(submit, true);
    api
      .post('/newsletter/subscribe', { email: email.value.trim(), consent: true })
      .then(done)
      .catch((err: unknown) => {
        setBusy(submit, false);
        showStatus(status, describeError(err, lang), true);
      });
  });
  return shadow;
}

export function mount(el: HTMLElement, doc: SiteDoc, boot: Boot): void {
  if (doc.newsletter) mountNewsletter(el, doc.newsletter, apiFor(boot), pageLang(doc.banner?.language));
}
