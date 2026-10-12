import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../src/api';
import { validateField } from '../src/fields';
import { mountForm } from '../src/forms';
import type { FormField } from '../src/types';
import { EMAIL_RE } from '../src/validate';
import { fakeApi, flush, form, shadowOf } from './fixtures';

const field = (over: Partial<FormField>): FormField => ({ key: 'k', label: 'K', type: 'text', required: false, options: [], max_length: 10, ...over });

describe('validateField mirrors the backend rules', () => {
  it('required / optional', () => {
    expect(validateField(field({ required: true }), '  ')).toBe('required');
    expect(validateField(field({}), '')).toBeNull();
    expect(validateField(field({ type: 'checkbox', required: true }), false)).toBe('required');
    expect(validateField(field({ type: 'checkbox', required: true }), true)).toBeNull();
  });

  it('length is measured after trimming', () => {
    expect(validateField(field({ max_length: 3 }), ' abc ')).toBeNull();
    expect(validateField(field({ max_length: 3 }), 'abcd')).toBe('too_long');
  });

  it('email', () => {
    const f = field({ type: 'email', max_length: 254 });
    expect(validateField(f, 'a.b+c@example.co')).toBeNull();
    for (const bad of ['a@b', 'a b@c.com', '@c.com', 'a@c..com', 'a@c.c']) expect(validateField(f, bad), bad).toBe('invalid_email');
    expect(EMAIL_RE.test("o'neil@x.org")).toBe(true);
  });

  it('phone', () => {
    const f = field({ type: 'tel', max_length: 50 });
    expect(validateField(f, '+39 (333) 123-4567')).toBeNull();
    expect(validateField(f, '12ab')).toBe('invalid_phone');
    expect(validateField(f, '123')).toBe('invalid_phone');
  });

  it('select and NUL bytes', () => {
    expect(validateField(field({ type: 'select', options: ['A'] }), 'B')).toBe('invalid_option');
    expect(validateField(field({ type: 'select', options: ['A'] }), 'A')).toBeNull();
    expect(validateField(field({}), 'a\0b')).toBe('invalid');
  });
});

describe('contact form widget', () => {
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
  const set = (name: string, value: string): void => {
    const el = q<HTMLInputElement>(`[name=${name}]`);
    el.value = value;
  };
  const check = (sel = 'input[type=checkbox]'): void => {
    q<HTMLInputElement>(sel).checked = true;
  };
  const submit = (): void => {
    q<HTMLFormElement>('form').dispatchEvent(new Event('submit', { cancelable: true }));
  };
  const fill = (): void => {
    set('name', 'Ada');
    set('email', 'ada@example.com');
    set('message', 'Hello');
    check();
  };

  it('renders labelled controls, a hidden honeypot and a privacy checkbox', () => {
    mountForm(host, form, fakeApi().api, 'en');
    expect(q('form').getAttribute('novalidate')).toBe('');
    expect(shadowOf(host).querySelectorAll('label').length).toBeGreaterThan(5);
    const trap = q<HTMLInputElement>('input[name=website]');
    expect(trap.getAttribute('tabindex')).toBe('-1');
    expect(trap.getAttribute('autocomplete')).toBe('off');
    expect(trap.closest('[aria-hidden=true]')).not.toBeNull();
    expect(q('button[type=submit]').textContent).toBe('Send it');
    expect(q('a').getAttribute('href')).toBe('https://example.com/privacy');
  });

  it('blocks invalid submissions with accessible errors and no request', () => {
    const { api, calls } = fakeApi();
    mountForm(host, form, api, 'en');
    set('email', 'nope');
    submit();
    expect(calls).toHaveLength(0);
    const email = q<HTMLInputElement>('[name=email]');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    const err = shadowOf(host).getElementById(email.getAttribute('aria-describedby') ?? '');
    expect(err?.textContent).toBe('Enter a valid email address');
    expect(q<HTMLInputElement>('[name=name]').getAttribute('aria-invalid')).toBe('true');
    expect(q<HTMLInputElement>('input[type=checkbox]').getAttribute('aria-invalid')).toBe('true');
  });

  it('submits trimmed data once, with honeypot field, then shows the success message', async () => {
    const { api, calls } = fakeApi();
    mountForm(host, form, api, 'en');
    fill();
    set('name', '  Ada  ');
    submit();
    submit(); // double submit while in flight
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(true);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/forms/f1/submit' });
    expect(calls[0]?.body).toMatchObject({ privacy: true, website: '', data: { name: 'Ada', email: 'ada@example.com', message: 'Hello' } });
    expect(q('[role=status]').textContent).toBe('Thanks!');
    expect(shadowOf(host).querySelector('input')).toBeNull();
  });

  it('sends the honeypot value so the server can drop the bot', async () => {
    const { api, calls } = fakeApi();
    mountForm(host, form, api, 'en');
    fill();
    set('website', 'http://spam');
    submit();
    await flush();
    expect((calls[0]?.body as { website: string }).website).toBe('http://spam');
  });

  it('maps server field violations onto the fields', async () => {
    const { api } = fakeApi(() => new ApiError(400, 'invalid_submission', 'Validation failed: email:invalid_email, message:too_long'));
    mountForm(host, form, api, 'it');
    fill();
    submit();
    await flush();
    expect(q<HTMLInputElement>('[name=email]').getAttribute('aria-invalid')).toBe('true');
    expect(q<HTMLTextAreaElement>('[name=message]').getAttribute('aria-invalid')).toBe('true');
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(false);
    const err = shadowOf(host).getElementById(q('[name=email]').getAttribute('aria-describedby') ?? '');
    expect(err?.textContent).toBe('Inserisci un indirizzo e-mail valido');
  });

  it('prefers structured details over the message', async () => {
    const err = new ApiError(400, 'invalid_submission', 'Validation failed', [
      { field: 'data.phone', message: 'invalid_phone' },
      { field: 'privacy', message: 'required' },
    ]);
    mountForm(host, form, fakeApi(() => err).api, 'en');
    fill();
    submit();
    await flush();
    expect(q<HTMLInputElement>('[name=phone]').getAttribute('aria-invalid')).toBe('true');
    expect(q<HTMLInputElement>('input[type=checkbox]').getAttribute('aria-invalid')).toBe('true');
    expect(q<HTMLInputElement>('[name=email]').hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows friendly messages for 429, network and unknown failures and re-enables the button', async () => {
    for (const [error, text] of [
      [new ApiError(429, 'rate_limited', 'x'), 'Too many requests. Please wait a minute and retry.'],
      [new ApiError(0, 'network', 'network'), 'Connection failed. Please try again.'],
      [new ApiError(500, 'internal_error', 'boom'), 'Something went wrong. Please try again.'],
    ] as const) {
      host.replaceChildren();
      mountForm(host, form, fakeApi(() => error).api, 'en');
      fill();
      submit();
      await flush();
      expect(q('[role=status]').textContent).toBe(text);
      expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(false);
    }
  });

  it('localizes defaults (empty submit_label)', () => {
    mountForm(host, { ...form, submit_label: '' }, fakeApi().api, 'de');
    expect(q('button[type=submit]').textContent).toBe('Senden');
  });
});
