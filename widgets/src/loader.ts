/**
 * Loader: the only stable-named file. Fetches the site configuration, then imports just the
 * content-hashed modules the page needs. Never throws into the host page.
 */
import type { Boot, ConsentApi, ConsentListener, MonethicalApi, SiteDoc } from './types';

type Mod = { mount?(el: HTMLElement, doc: SiteDoc, boot: Boot): void; start?(doc: SiteDoc, boot: Boot): void };
type Load = (url: string) => Promise<Mod>;

const WIDGETS: Record<string, string> = { 'contact-form': 'forms', newsletter: 'newsletter', survey: 'survey', items: 'items' };
const SELECTOR = '[data-monethical-widget]';

const defaultLoad: Load = (url) => import(/* @vite-ignore */ url) as Promise<Mod>;

/** Starts the loader; returns a function that stops watching for late containers. */
export function run(script: HTMLScriptElement | null, load: Load = defaultLoad): () => void {
  let stop = (): void => undefined;
  const w = window;
  const fail = (e: unknown): void => {
    w.dispatchEvent(new CustomEvent('monethical:error', { detail: { message: e instanceof Error ? e.message : String(e) } }));
  };
  try {
    const key = script?.dataset.siteKey;
    if (!script || !key || w.Monethical) return stop;
    const src = new URL(script.src, location.href);
    const base = (script.dataset.base ?? src.href.slice(0, src.href.lastIndexOf('/') + 1)).replace(/\/*$/, '/');
    const api = (script.dataset.apiBase ?? src.origin).replace(/\/+$/, '');

    const listeners: ConsentListener[] = [];
    const consent: ConsentApi = {
      get: () => null,
      open: () => { consent.o = true; },
      onChange: (cb) => {
        listeners.push(cb);
        consent.l = listeners;
        return () => { listeners.splice(listeners.indexOf(cb) >>> 0, 1); };
      },
    };
    const monethical: MonethicalApi = { v: 1, consent };
    w.Monethical = monethical;

    const modules = new Map<string, Promise<Mod>>();
    const get = (name: string): Promise<Mod> => {
      let p = modules.get(name);
      if (!p) {
        p = load(base + (__MANIFEST__[name] ?? ''));
        modules.set(name, p);
      }
      return p;
    };

    fetch(`${api}/config/${encodeURIComponent(key)}/site.json`, { cache: 'default', credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error(`config ${r.status}`);
        return r.json() as Promise<SiteDoc>;
      })
      .then((doc) => {
        const boot: Boot = { key, api, doc };
        if (doc.banner) get('consent').then((m) => m.start?.(doc, boot)).catch(fail);
        const seen = new WeakSet<Element>();
        const mountEl = (el: HTMLElement): void => {
          const type = el.dataset.monethicalWidget ?? '';
          const name = Object.hasOwn(WIDGETS, type) ? WIDGETS[type] : undefined;
          if (!name || seen.has(el)) return;
          seen.add(el);
          get(name).then((m) => m.mount?.(el, doc, boot)).catch(fail);
        };
        document.querySelectorAll<HTMLElement>(SELECTOR).forEach(mountEl);
        const observer = new MutationObserver((records) => {
          for (const r of records) {
            r.addedNodes.forEach((n) => {
              if (!(n instanceof HTMLElement)) return;
              if (n.matches(SELECTOR)) mountEl(n);
              n.querySelectorAll<HTMLElement>(SELECTOR).forEach(mountEl);
            });
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        stop = () => { observer.disconnect(); };
      })
      .catch(fail);
  } catch (e) {
    fail(e);
  }
  return () => { stop(); };
}

run(document.currentScript instanceof HTMLScriptElement ? document.currentScript : document.querySelector<HTMLScriptElement>('script[data-site-key][src*="loader"]'));
