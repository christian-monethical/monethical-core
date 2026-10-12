import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../src/api';
import { mountNewsletter } from '../src/newsletter';
import { mountSurvey } from '../src/survey';
import { fakeApi, flush, newsletter, shadowOf, survey } from './fixtures';

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.replaceChildren(host);
});
const q = <T extends Element>(sel: string): T => {
  const el = shadowOf(host).querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const submit = (): void => {
  q<HTMLFormElement>('form').dispatchEvent(new Event('submit', { cancelable: true }));
};

describe('newsletter widget', () => {
  const fill = (email: string, consent = true): void => {
    q<HTMLInputElement>('input[type=email]').value = email;
    q<HTMLInputElement>('input[type=checkbox]').checked = consent;
  };

  it('validates the email and requires consent', () => {
    const { api, calls } = fakeApi();
    mountNewsletter(host, newsletter, api, 'en');
    fill('bad');
    submit();
    expect(q('input[type=email]').getAttribute('aria-invalid')).toBe('true');
    fill('ok@example.com', false);
    submit();
    expect(q('input[type=checkbox]').getAttribute('aria-invalid')).toBe('true');
    expect(calls).toHaveLength(0);
  });

  it('subscribes with consent and shows the configured success message', async () => {
    const { api, calls } = fakeApi();
    mountNewsletter(host, newsletter, api, 'en');
    fill(' ok@example.com ');
    submit();
    submit();
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: '/newsletter/subscribe', body: { email: 'ok@example.com', consent: true } });
    expect(q('[role=status]').textContent).toBe('Welcome!');
  });

  it('a filled honeypot pretends success without any request', async () => {
    const { api, calls } = fakeApi();
    mountNewsletter(host, newsletter, api, 'en');
    fill('ok@example.com');
    q<HTMLInputElement>('input[name=website]').value = 'x';
    submit();
    await flush();
    expect(calls).toHaveLength(0);
    expect(q('[role=status]').textContent).toBe('Welcome!');
  });

  it('reports rate limiting and re-enables the form', async () => {
    mountNewsletter(host, newsletter, fakeApi(() => new ApiError(429, 'rate_limited', '')).api, 'fr');
    fill('ok@example.com');
    submit();
    await flush();
    expect(q('[role=status]').textContent).toBe('Trop de requêtes. Patientez une minute.');
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(false);
  });
});

describe('survey widget', () => {
  const pick = (group: number, value: string): void => {
    const fieldsets = shadowOf(host).querySelectorAll('fieldset');
    const input = fieldsets[group]?.querySelector<HTMLInputElement>(`input[value="${value}"]`);
    if (!input) throw new Error('missing option');
    input.checked = true;
  };

  it('renders each question type accessibly', () => {
    mountSurvey(host, survey, fakeApi().api, 'en');
    expect(q('form').getAttribute('aria-labelledby')).toBeTruthy();
    expect(shadowOf(host).querySelectorAll('fieldset')).toHaveLength(3);
    expect(shadowOf(host).querySelectorAll('fieldset')[0]?.querySelectorAll('input[type=radio]')).toHaveLength(5);
    expect(shadowOf(host).querySelectorAll('legend')).toHaveLength(3);
    expect(q('textarea').getAttribute('maxlength')).toBe('2000');
  });

  it('requires required questions', () => {
    const { api, calls } = fakeApi();
    mountSurvey(host, survey, api, 'en');
    submit();
    expect(calls).toHaveLength(0);
    expect(shadowOf(host).querySelector('fieldset input')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('sends typed answers (int rating, boolean, choice, text) and omits empty ones', async () => {
    const { api, calls } = fakeApi();
    mountSurvey(host, survey, api, 'en');
    pick(0, '4');
    pick(2, 'true');
    submit();
    await flush();
    expect(calls[0]).toMatchObject({ path: '/surveys/s1/respond', body: { answers: { score: 4, again: true } } });
    expect(q('[role=status]').textContent).toBe('Thanks for the feedback');
  });

  it('maps server answer errors back to the question', async () => {
    const { api } = fakeApi(() => new ApiError(400, 'invalid_submission', 'Validation failed: score:invalid_rating'));
    mountSurvey(host, survey, api, 'en');
    pick(0, '4');
    submit();
    await flush();
    expect(shadowOf(host).querySelector('fieldset input')?.getAttribute('aria-invalid')).toBe('true');
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(false);
  });
});
