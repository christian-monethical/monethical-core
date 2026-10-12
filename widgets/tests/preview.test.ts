import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../src/consent-core';
import {
  mountBannerPreview,
  mountFormPreview,
  mountItemPreview,
  mountNewsletterPreview,
  mountSurveyPreview,
} from '../src/preview';
import { banner, flush, form, newsletter, room, survey } from './fixtures';

let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.cookie = `${STORAGE_KEY}=; Max-Age=0; Path=/`;
  localStorage.clear();
  window.dataLayer = undefined;
  host = document.createElement('div');
  document.body.replaceChildren(host);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const root = (): ShadowRoot => {
  const sr = host.firstElementChild?.shadowRoot;
  if (!sr) throw new Error('nothing mounted');
  return sr;
};

describe('console previews', () => {
  it('banner: rendered inside the host, update re-renders, destroy removes', () => {
    const p = mountBannerPreview(host, banner);
    expect(host.firstElementChild?.shadowRoot?.querySelector('.pv')).not.toBeNull();
    expect(root().querySelector('h2')?.textContent).toBe('We value your privacy');
    p.update({ ...banner, texts: { ...banner.texts, title: 'Changed' }, layout: 'modal' });
    expect(host.children).toHaveLength(1);
    expect(root().querySelector('h2')?.textContent).toBe('Changed');
    expect(root().querySelector('.ov')).not.toBeNull();
    p.destroy();
    expect(host.children).toHaveLength(0);
  });

  it('banner preview never writes cookies/storage/dataLayer and never calls the network', () => {
    const p = mountBannerPreview(host, banner);
    for (const label of ['Accept all', 'Only necessary']) {
      const btn = Array.from(root().querySelectorAll('button')).find((b) => b.textContent === label);
      btn?.click();
      p.update(banner);
    }
    expect(document.cookie).not.toContain(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('form preview submits "successfully" without network', async () => {
    const p = mountFormPreview(host, form);
    for (const [k, v] of [['name', 'Ada'], ['email', 'a@example.com'], ['message', 'Hi']] as const) {
      (root().querySelector(`[name=${k}]`) as HTMLInputElement).value = v;
    }
    (root().querySelector('input[type=checkbox]') as HTMLInputElement).checked = true;
    root().querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(root().querySelector('[role=status]')?.textContent).toBe('Thanks!');
    expect(fetchMock).not.toHaveBeenCalled();
    p.update({ ...form, success_message: 'Updated' });
    expect(root().querySelector('form')).not.toBeNull();
    p.destroy();
    expect(host.children).toHaveLength(0);
  });

  it('newsletter and survey previews render and update', () => {
    const n = mountNewsletterPreview(host, newsletter);
    expect(root().querySelector('h3')?.textContent).toBe('Subscribe');
    n.update({ ...newsletter, headline: 'Other' });
    expect(root().querySelector('h3')?.textContent).toBe('Other');
    n.destroy();
    const s = mountSurveyPreview(host, survey);
    expect(root().querySelector('h3')?.textContent).toBe('Feedback');
    s.update({ ...survey, title: 'Poll' });
    expect(root().querySelector('h3')?.textContent).toBe('Poll');
    s.destroy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('item preview serves local availability and a fake booking', async () => {
    const p = mountItemPreview(host, room);
    expect(root().querySelector('.card h3')?.textContent).toBe('Sea room');
    root().querySelector<HTMLButtonElement>('.card .btn')?.click();
    await flush();
    expect(root().querySelectorAll('.d:not([aria-disabled])').length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    p.update({ ...room, name: 'Renamed' });
    expect(root().querySelector('.card h3')?.textContent).toBe('Renamed');
    p.destroy();
  });
});
