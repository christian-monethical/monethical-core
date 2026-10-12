import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBanner } from '../src/consent';
import { mountForm } from '../src/forms';
import { mountItems } from '../src/items';
import { mountNewsletter } from '../src/newsletter';
import { mountSurvey } from '../src/survey';
import type { Surface } from '../src/types';
import { banner, fakeApi, flush, form, newsletter, room, surface, survey } from './fixtures';

const EVIL = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
const evilSurface = {
  ...surface,
  background: 'red;} * {display:none',
  accent: 'url(javascript:alert(1))',
  font: '};body{display:none',
} as unknown as Surface;

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.replaceChildren(host);
  Reflect.deleteProperty(window, '__pwned');
});

/** Everything dangerous would show up as a live element inside the shadow tree. */
function assertInert(root: ParentNode): void {
  expect(root.querySelector('script')).toBeNull();
  expect(root.querySelector('img[onerror]')).toBeNull();
  expect(root.querySelectorAll('[onerror],[onclick],[onload]')).toHaveLength(0);
  expect(Reflect.get(window, '__pwned')).toBeUndefined();
}

const rootOf = (el: HTMLElement): ShadowRoot => {
  const sr = el.firstElementChild?.shadowRoot;
  if (!sr) throw new Error('no shadow');
  return sr;
};

describe('malicious configuration renders as text', () => {
  it('consent banner', () => {
    const texts = Object.fromEntries(Object.keys(banner.texts).map((k) => [k, EVIL])) as unknown as typeof banner.texts;
    mountBanner(host, { ...banner, texts, surface: evilSurface, logo_url: 'javascript:alert(1)', privacy_url: 'https://x.example.com/"onclick="alert(1)' }, { preview: false, initial: null, onChoice: () => undefined });
    const root = rootOf(host);
    assertInert(root);
    expect(root.querySelector('h2')?.textContent).toBe(EVIL);
    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
  });

  it('contact form (labels, options, placeholders, messages, urls)', async () => {
    const evilForm = {
      ...form,
      surface: evilSurface,
      submit_label: EVIL,
      success_message: EVIL,
      privacy_text: EVIL,
      privacy_url: 'javascript:alert(1)',
      fields: form.fields.map((f) => ({ ...f, label: EVIL, placeholder: EVIL, options: f.type === 'select' ? [EVIL] : [] })),
    };
    mountForm(host, evilForm, fakeApi().api, 'en');
    const root = rootOf(host);
    assertInert(root);
    expect(root.querySelector('label')?.textContent).toContain(EVIL);
    expect(root.querySelector('button[type=submit]')?.textContent).toBe(EVIL);
    expect(root.querySelector('a')).toBeNull();
    for (const [k, v] of [['name', 'a'], ['email', 'a@example.com'], ['message', 'm']] as const) {
      (root.querySelector(`[name=${k}]`) as HTMLInputElement).value = v;
    }
    (root.querySelector('input[type=checkbox]') as HTMLInputElement).checked = true;
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(root.querySelector('[role=status]')?.textContent).toBe(EVIL);
    assertInert(root);
  });

  it('newsletter', () => {
    mountNewsletter(host, { ...newsletter, surface: evilSurface, headline: EVIL, subheadline: EVIL, button_label: EVIL, privacy_text: EVIL, success_message: EVIL, privacy_url: 'http://insecure.example.com' }, fakeApi().api, 'en');
    const root = rootOf(host);
    assertInert(root);
    expect(root.querySelector('h3')?.textContent).toBe(EVIL);
    expect(root.querySelector('a')).toBeNull();
  });

  it('survey', () => {
    const s = { ...survey, surface: evilSurface, title: EVIL, description: EVIL, submit_label: EVIL, questions: survey.questions.map((q) => ({ ...q, text: EVIL, options: q.options.map(() => EVIL) })) };
    mountSurvey(host, s, fakeApi().api, 'en');
    const root = rootOf(host);
    assertInert(root);
    expect(root.querySelector('h3')?.textContent).toBe(EVIL);
    expect(root.querySelector('legend')?.textContent).toContain(EVIL);
  });

  it('catalog card and detail dialog', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const evil = { ...room, surface: evilSurface, name: EVIL, description: EVIL, amenities: [EVIL], button_text: EVIL, image_url: 'javascript:alert(1)', gallery: ['data:image/svg+xml,<svg onload=alert(1)>', 'https://cdn.example.com/ok.jpg'] };
    mountItems(host, [evil], fakeApi(() => []).api, 'en', 'en');
    const root = rootOf(host);
    root.querySelector<HTMLButtonElement>('.card .btn')?.click();
    await flush();
    assertInert(root);
    expect(root.querySelector('.card h3')?.textContent).toBe(EVIL);
    expect(root.querySelector('dialog h2')?.textContent).toBe(EVIL);
    expect(root.querySelector('.am li')?.textContent).toBe(EVIL);
    const srcs = Array.from(root.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['https://cdn.example.com/ok.jpg']);
    vi.unstubAllGlobals();
  });

  it('hostile surface tokens never reach the stylesheet or style attributes', () => {
    mountNewsletter(host, { ...newsletter, surface: evilSurface }, fakeApi().api, 'en');
    const holder = host.firstElementChild as HTMLElement;
    const style = holder.getAttribute('style') ?? '';
    expect(style).not.toMatch(/javascript|display:\s*none|url\(/i);
    expect(style).toContain('--bg: #ffffff');
    expect(rootOf(host).querySelector('style')?.textContent).not.toMatch(/javascript:/);
  });
});
