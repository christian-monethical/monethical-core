/** Cookie-consent banner: UI, controller and the public `window.Monethical.consent` API. */
import { createApi } from './api';
import {
  buildStored,
  consentModeDefault,
  consentModeUpdate,
  gate,
  isValid,
  newVisitorId,
  readStored,
  toChoice,
  writeStored,
  type Choice,
} from './consent-core';
import { clear, emit, h, mountShadow, safeUrl, uid, type Shadow } from './dom';
import { applyTokens } from './tokens';
import type { BannerConfig, Boot, ConsentCategory, ConsentApi, ConsentListener, SiteDoc } from './types';

const CSS = `
:host{display:block}
*,*::before,*::after{box-sizing:border-box}
.pv{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.pv>*{pointer-events:auto}
.b,.badge,.ov{position:fixed;z-index:2147483000}
.pv .b,.pv .badge,.pv .ov{position:absolute}
.b{font:14px/1.5 var(--font);color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);box-shadow:var(--sh);padding:var(--pad);max-height:calc(100% - 24px);overflow:auto;-webkit-font-smoothing:antialiased}
.b:focus{outline:none}
.bar-bottom,.bar-top{left:12px;right:12px;margin:0 auto;max-width:1100px}
.bar-bottom{bottom:12px}
.bar-top{top:12px}
.card-left,.card-right{bottom:16px;width:min(380px,calc(100% - 32px))}
.card-left{left:16px}
.card-right{right:16px}
.ov{inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.5)}
.modal{position:relative;width:min(520px,100%)}
.in{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.card-left .in,.card-right .in,.modal .in{display:block}
.tx{flex:1 1 360px;min-width:0}
.hd{display:flex;gap:12px;align-items:center;margin:0 0 6px}
.hd img{width:32px;height:32px;object-fit:contain;border-radius:6px}
h2{margin:0;font-size:16px;line-height:1.3}
p{margin:0}
a{color:var(--tx);text-underline-offset:2px}
.ac{display:flex;gap:8px;flex-wrap:wrap;margin-top:0;flex:none}
.card-left .ac,.card-right .ac,.modal .ac,.prefs .ac{margin-top:14px}
.btn{font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--ac);background:var(--ac);color:var(--at);border-radius:var(--r2);padding:9px 16px;min-height:40px}
.btn:hover{opacity:.9}
.btn.sec{background:transparent;color:var(--tx);border-color:var(--bd)}
.card-left .btn,.card-right .btn,.modal .btn{flex:1 1 auto}
button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--fc);outline-offset:2px}
.cats{margin:14px 0 0;padding:0;list-style:none;border-top:1px solid var(--bd)}
.cat{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--bd);cursor:pointer}
.ct{display:block;min-width:0}
.ct b{display:block}
.ct small{display:block;color:var(--mu);font-size:12.5px}
.sw{appearance:none;flex:none;width:44px;height:26px;margin:0;border-radius:13px;border:1px solid var(--mu);background:var(--bd);position:relative;cursor:pointer}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:var(--bg);border:1px solid var(--mu);transition:transform .15s}
.sw:checked{background:var(--ac);border-color:var(--ac)}
.sw:checked::after{transform:translateX(18px)}
.sw:disabled{opacity:.6;cursor:not-allowed}
.badge{left:16px;bottom:16px;width:44px;height:44px;border-radius:50%;border:1px solid var(--bd);background:var(--bg);color:var(--tx);box-shadow:var(--sh);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.badge[hidden],.b[hidden],.ov[hidden]{display:none}
@media (prefers-reduced-motion:no-preference){.b{animation:in .22s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}}}
@media (max-width:520px){.bar-bottom,.bar-top{left:8px;right:8px}.bar-bottom{bottom:8px}.bar-top{top:8px}.btn{flex:1 1 100%}}
@media (forced-colors:active){.b,.badge,.btn{border:2px solid CanvasText}.sw:checked{background:Highlight}}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an inline SVG from fixed path data (never from config). */
export function icon(paths: string[], size = 20): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const CATEGORIES: readonly ConsentCategory[] = ['necessary', 'preferences', 'analytics', 'marketing'];
const COOKIE_ICON = [
  'M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5',
  'M8.5 8.5v.01',
  'M16 15.5v.01',
  'M12 12v.01',
  'M11 17v.01',
  'M7 14v.01',
];

type View = 'main' | 'prefs';

export interface BannerHooks {
  /** Preview mode: positioned inside the parent, never steals focus. */
  preview: boolean;
  initial: Choice | null;
  onChoice(choice: Choice): void;
}

export interface BannerHandle {
  open: () => void;
  destroy: () => void;
}

function text(cfg: BannerConfig, key: string): string {
  const v = (cfg.texts as unknown as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]'));
}

export function mountBanner(parent: Node, cfg: BannerConfig, hooks: BannerHooks): BannerHandle {
  const shadow: Shadow = mountShadow(parent, CSS);
  applyTokens(shadow.holder, cfg.surface);
  const layout = ['bar-bottom', 'bar-top', 'card-left', 'card-right', 'modal'].includes(cfg.layout) ? cfg.layout : 'bar-bottom';
  const offered = cfg.categories.filter((c) => c !== 'necessary' && CATEGORIES.includes(c));
  const id = uid();
  const wrap = h('div', { class: hooks.preview ? 'pv' : null });
  const layer = h('div');
  const badgeLabel = text(cfg, 'reopen_label');
  const badge = h('button', { type: 'button', class: 'badge', 'aria-label': badgeLabel, title: badgeLabel, click: () => { open(); } }, icon(COOKIE_ICON, 22));
  wrap.append(layer, badge);
  shadow.root.appendChild(wrap);

  let current = hooks.initial;
  let view: View = 'main';
  let visible = current === null;
  let draft: Choice = current ?? { necessary: true, preferences: false, analytics: false, marketing: false };
  let previous: Element | null = null;

  const choose = (choice: Choice): void => {
    const hadFocus = document.activeElement === shadow.holder;
    current = choice;
    visible = false;
    render();
    if (hadFocus && !hooks.preview) {
      if (cfg.show_reopen_badge) badge.focus();
      else if (previous instanceof HTMLElement) previous.focus();
    }
    hooks.onChoice(choice);
  };
  const all = (on: boolean): Choice => ({
    necessary: true,
    preferences: on && offered.includes('preferences'),
    analytics: on && offered.includes('analytics'),
    marketing: on && offered.includes('marketing'),
  });

  const focusDialog = (): void => {
    const dlg = layer.querySelector<HTMLElement>('[role=dialog]');
    dlg?.focus();
  };

  const toggles = (): HTMLElement => {
    const row = (cat: ConsentCategory): HTMLElement => {
      const locked = cat === 'necessary';
      const input = h('input', {
        type: 'checkbox',
        role: 'switch',
        class: 'sw',
        checked: locked || draft[cat],
        disabled: locked,
        'aria-describedby': `${id}-${cat}`,
      });
      input.addEventListener('change', () => {
        if (!locked) draft = { ...draft, [cat]: input.checked };
      });
      return h(
        'li',
        null,
        h('label', { class: 'cat' }, h('span', { class: 'ct' }, h('b', null, text(cfg, `${cat}_label`)), h('small', { id: `${id}-${cat}` }, text(cfg, `${cat}_description`))), input),
      );
    };
    return h('ul', { class: 'cats' }, ...(['necessary', ...offered] as ConsentCategory[]).map(row));
  };

  const dialog = (): HTMLElement => {
    const href = safeUrl(cfg.privacy_url);
    const logo = safeUrl(cfg.logo_url);
    const prefs = view === 'prefs';
    const button = (label: string, cls: string, fn: () => void): HTMLButtonElement =>
      h('button', { type: 'button', class: `btn ${cls}`, click: fn }, label);
    const actions = prefs
      ? [
          button(text(cfg, 'reject_all'), '', () => { choose(all(false)); }),
          button(text(cfg, 'save'), '', () => { choose(draft); }),
          button(text(cfg, 'accept_all'), '', () => { choose(all(true)); }),
        ]
      : [
          button(text(cfg, 'customize'), 'sec', () => {
            draft = current ?? all(false);
            view = 'prefs';
            render();
            layer.querySelector<HTMLElement>('h2')?.focus();
          }),
          button(text(cfg, 'reject_all'), '', () => { choose(all(false)); }),
          button(text(cfg, 'accept_all'), '', () => { choose(all(true)); }),
        ];
    const title = h('h2', { id: `${id}-t`, tabindex: '-1' }, text(cfg, 'title'));
    const body = h(
      'p',
      { id: `${id}-b` },
      text(cfg, 'body'),
      href && ' ',
      href && h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text(cfg, 'privacy_link_label')),
    );
    const dlg = h(
      'div',
      {
        class: `b ${layout}${prefs ? ' prefs' : ''}`,
        role: 'dialog',
        'aria-modal': layout === 'modal' ? 'true' : 'false',
        'aria-labelledby': `${id}-t`,
        'aria-describedby': `${id}-b`,
        tabindex: '-1',
      },
      h(
        'div',
        { class: 'in' },
        h('div', { class: 'tx' }, h('div', { class: 'hd' }, logo && h('img', { src: logo, alt: '', referrerpolicy: 'no-referrer', decoding: 'async' }), title), body, prefs && toggles()),
        h('div', { class: 'ac' }, ...actions),
      ),
    );
    dlg.addEventListener('keydown', onKey);
    return layout === 'modal' ? h('div', { class: 'ov' }, dlg) : dlg;
  };

  function render(): void {
    clear(layer);
    badge.hidden = visible || current === null || !cfg.show_reopen_badge;
    if (visible) layer.appendChild(dialog());
  }

  function onKey(ev: Event): void {
    const e = ev as KeyboardEvent;
    if (e.key === 'Escape') {
      if (view === 'prefs' && current === null) {
        view = 'main';
        render();
        layer.querySelector<HTMLElement>('h2')?.focus();
      } else if (current !== null) {
        visible = false;
        render();
        if (!hooks.preview) badge.focus();
      }
      return;
    }
    if (e.key !== 'Tab' || layout !== 'modal') return;
    const dlg = layer.querySelector<HTMLElement>('[role=dialog]');
    const items = dlg ? focusables(dlg) : [];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = e.target;
    if (e.shiftKey && (active === first || active === dlg)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open(): void {
    previous = document.activeElement;
    draft = current ?? all(false);
    view = 'prefs';
    visible = true;
    render();
    focusDialog();
  }

  /** Keep keyboard focus inside a modal even when it escapes through the page. */
  const keepFocus = (e: FocusEvent): void => {
    if (visible && layout === 'modal' && e.target !== shadow.holder) {
      focusables(layer)[0]?.focus();
    }
  };
  document.addEventListener('focusin', keepFocus);

  render();
  if (visible && layout === 'modal' && !hooks.preview) focusDialog();

  return {
    open,
    destroy: () => {
      document.removeEventListener('focusin', keepFocus);
      shadow.destroy();
    },
  };
}

// ----------------------------------------------------------------------- controller

const RETRY_MS = 2000;

function sendProof(boot: Boot, version: number, stored: ReturnType<typeof buildStored>): void {
  const api = createApi(boot.api, boot.key);
  const body = {
    banner_version: version,
    preferences: stored.categories.preferences,
    analytics: stored.categories.analytics,
    marketing: stored.categories.marketing,
    visitor_id: stored.visitor_id,
  };
  const attempt = (retry: boolean): void => {
    api.post('/consent', body, { keepalive: true }).catch((err: unknown) => {
      if (retry) setTimeout(() => { attempt(false); }, RETRY_MS);
      else emit('monethical:error', { widget: 'consent', message: err instanceof Error ? err.message : 'consent proof failed' });
    });
  };
  attempt(true);
}

export function start(doc: SiteDoc, boot: Boot): void {
  const cfg = doc.banner;
  if (!cfg) return;
  const version = typeof cfg.version === 'number' ? cfg.version : 1;
  const days = Math.min(395, Math.max(1, cfg.consent_expiry_days));
  const stored = readStored();
  const valid = isValid(stored, version, Date.now());
  let current: Choice | null = valid ? toChoice(stored.categories) : null;
  const visitorId = stored?.visitor_id ?? newVisitorId();
  const listeners: ConsentListener[] = [];

  if (cfg.google_consent_mode) {
    consentModeDefault(valid ? 0 : 500);
    if (current) consentModeUpdate(current);
  }

  const api: ConsentApi = window.Monethical?.consent ?? { get: () => null, open: () => undefined, onChange: () => () => undefined };
  listeners.push(...(api.l ?? []));
  api.l = undefined;

  const run = (): void => {
    gate(current);
    const banner = mountBanner(document.body, cfg, {
      preview: false,
      initial: current,
      onChoice: (choice) => {
        current = choice;
        const saved = buildStored(choice, version, days, visitorId, Date.now());
        writeStored(saved);
        if (cfg.google_consent_mode) consentModeUpdate(choice);
        gate(choice);
        emit('monethical:consent', choice);
        for (const cb of [...listeners]) {
          try {
            cb(choice);
          } catch (err) {
            emit('monethical:error', { widget: 'consent', message: String(err) });
          }
        }
        sendProof(boot, version, saved);
      },
    });
    api.open = banner.open;
    if (api.o) banner.open();
    api.o = undefined;
  };

  api.get = () => current;
  api.onChange = (cb) => {
    listeners.push(cb);
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  };
  if (window.Monethical) window.Monethical.consent = api;
  else window.Monethical = { v: 1, consent: api };

  if (current) emit('monethical:consent', current);
  if ((document.body as HTMLElement | null) !== null) run();
  else document.addEventListener('DOMContentLoaded', run, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { gate(current); }, { once: true });
}
