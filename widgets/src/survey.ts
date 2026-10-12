/** Survey widget (`data-monethical-widget="survey" data-id="<survey_id>"`). */
import { apiFor, ApiError, type Api } from './api';
import { emit, h, mountShadow, uid, type Shadow } from './dom';
import { applyTokens } from './tokens';
import { ERR, pageLang, type Dict, type Lang } from './i18n';
import type { Boot, PublicSurvey, SiteDoc, SurveyQuestion } from './types';
import { BASE_CSS, describeError, errorSlot, fieldBox, honeypot, setBusy, setError, showStatus, statusRegion } from './ui';
import { errText, parseServerErrors } from './fields';

const T: Dict<'send' | 'yes' | 'no'> = {
  it: { send: 'Invia', yes: 'Sì', no: 'No' },
  en: { send: 'Send', yes: 'Yes', no: 'No' },
  de: { send: 'Senden', yes: 'Ja', no: 'Nein' },
  fr: { send: 'Envoyer', yes: 'Oui', no: 'Non' },
  es: { send: 'Enviar', yes: 'Sí', no: 'No' },
};

const CSS = `
.rate{display:flex;gap:6px;flex-wrap:wrap}
.rate label{position:relative;font-weight:600;cursor:pointer}
.rate input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.rate span{display:flex;align-items:center;justify-content:center;min-width:42px;height:42px;border:1px solid var(--bd);border-radius:var(--r2)}
.rate input:checked+span{background:var(--ac);color:var(--at);border-color:var(--ac)}
.rate input:focus-visible+span{outline:2px solid var(--fc);outline-offset:2px}
`;


export interface GroupBox {
  el: HTMLElement;
  inputs: HTMLInputElement[];
  setError: (message: string | null) => void;
}

/** Radio group inside a fieldset; `options` are [value, visible label]. `chips` renders a compact row. */
export function radioGroup(
  id: string,
  legend: string,
  name: string,
  options: [string, string][],
  required: boolean,
  chips = false,
): GroupBox {
  const slot = errorSlot(id);
  const inputs = options.map(([value]) =>
    h('input', { type: 'radio', name: `${id}-${name}`, value, 'aria-required': required ? 'true' : null }),
  );
  const rows = options.map(([, text], i) => h('label', { class: chips ? null : 'opt' }, inputs[i], h('span', null, text)));
  const heading = h('legend', null, legend, required && h('span', { 'aria-hidden': 'true' }, ' *'));
  const el = h('fieldset', { class: 'f', id }, heading, ...(chips ? [h('div', { class: 'rate' }, ...rows)] : rows), slot);
  return { el, inputs, setError: (m) => { setError(slot, inputs, m); } };
}

type Answer = string | number | boolean;

interface Entry {
  q: SurveyQuestion;
  el: HTMLElement;
  answer(): Answer | undefined;
  setError: (message: string | null) => void;
  focus(): void;
}

function entryFor(q: SurveyQuestion, id: string, lang: Lang): Entry {
  if (q.type === 'text') {
    const area = h('textarea', { name: q.key, maxlength: 2000, rows: 3 });
    const box = fieldBox(id, q.text, area, q.required);
    return { q, el: box.el, answer: () => area.value.trim() || undefined, setError: box.setError, focus: () => { area.focus(); } };
  }
  let options: [string, string][];
  if (q.type === 'rating') options = Array.from({ length: q.rating_max }, (_, i) => [String(i + 1), String(i + 1)]);
  else if (q.type === 'boolean') options = [['true', T[lang].yes], ['false', T[lang].no]];
  else options = q.options.map((o) => [o, o]);
  const group = radioGroup(id, q.text, q.key, options, q.required, q.type === 'rating');
  const answer = (): Answer | undefined => {
    const v = group.inputs.find((i) => i.checked)?.value;
    if (v === undefined) return undefined;
    if (q.type === 'rating') return Number(v);
    return q.type === 'boolean' ? v === 'true' : v;
  };
  return {
    q,
    el: group.el,
    answer,
    setError: group.setError,
    focus: () => { (group.inputs.find((i) => i.checked) ?? group.inputs[0])?.focus(); },
  };
}

/** Render the survey into `parent`; used by the loader and by the console preview. */
export function mountSurvey(parent: Node, survey: PublicSurvey, api: Api, lang: Lang): Shadow {
  const shadow = mountShadow(parent, BASE_CSS + CSS);
  applyTokens(shadow.holder, survey.surface);
  const id = uid();
  const entries = survey.questions.map((q, i) => entryFor(q, `${id}-${i}`, lang));
  const trap = honeypot();
  const submit = h('button', { type: 'submit', class: 'btn' }, survey.submit_label || T[lang].send);
  const status = statusRegion();
  const el = h(
    'form',
    { class: 'w', novalidate: true, 'aria-labelledby': `${id}-t` },
    h('h3', { id: `${id}-t` }, survey.title),
    survey.description && h('p', { class: 'mu' }, survey.description),
    ...entries.map((e) => e.el),
    trap.el,
    submit,
    status,
  );
  shadow.root.appendChild(el);

  const check = (): Entry | undefined => {
    let first: Entry | undefined;
    for (const e of entries) {
      const missing = e.q.required && e.answer() === undefined;
      e.setError(missing ? ERR[lang].required : null);
      if (missing) first ??= e;
    }
    return first;
  };

  el.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    showStatus(status, '', false);
    const invalid = check();
    if (invalid) return invalid.focus();
    const done = (): void => {
      el.replaceChildren(status);
      showStatus(status, survey.success_message, false);
      status.focus();
      emit('monethical:submit', { widget: 'survey', id: survey.survey_id });
    };
    if (trap.input.value) return done(); // bot: pretend success, send nothing
    const answers: Record<string, Answer> = {};
    for (const e of entries) {
      const a = e.answer();
      if (a !== undefined) answers[e.q.key] = a;
    }
    setBusy(submit, true);
    api
      .post(`/surveys/${encodeURIComponent(survey.survey_id)}/respond`, { answers })
      .then(done)
      .catch((err: unknown) => {
        setBusy(submit, false);
        if (err instanceof ApiError && err.code === 'invalid_submission') {
          const codes = parseServerErrors(err);
          const hit = entries.filter((e) => codes[e.q.key]);
          hit.forEach((e) => { e.setError(errText(lang, codes[e.q.key] ?? 'invalid')); });
          if (hit[0]) return hit[0].focus();
        }
        showStatus(status, describeError(err, lang), true);
      });
  });
  return shadow;
}

export function mount(el: HTMLElement, doc: SiteDoc, boot: Boot): void {
  const wanted = el.dataset.id;
  const survey = doc.surveys.find((s) => s.survey_id === wanted) ?? (wanted ? undefined : doc.surveys[0]);
  if (survey) mountSurvey(el, survey, apiFor(boot), pageLang(doc.banner?.language));
}
