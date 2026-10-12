import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { displayClaims } from '../auth/session';
import { useMe } from '../features/account/useMe';
import { t } from '../i18n';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Toaster } from '../ui/Toaster';
import { dirtyCount } from '../ui/useUnsaved';
import { prefetchOnIntent } from './prefetch';
import { loaders } from './routes';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  prefetch?: () => unknown;
}

function Brand() {
  return (
    <Link href="/sites" class="brand" aria-label="Monethical">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 22V10l7 8 7-8v12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>Monethical</span>
    </Link>
  );
}

export function Shell({ children }: { children: ComponentChildren }) {
  const [location] = useLocation();
  const me = useMe();
  const main = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  // Route change: close the mobile menu, move focus to <main> and reset scroll.
  useEffect(() => {
    setOpen(false);
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.split('/').slice(0, 3).join('/')]);

  const items: NavItem[] = [
    { href: '/sites', label: t('nav.sites'), icon: 'sites', prefetch: loaders.sites },
    { href: '/payments', label: t('nav.payments'), icon: 'card', prefetch: loaders.payments },
    ...(me.data?.is_staff ? [{ href: '/admin', label: t('nav.admin'), icon: 'users' as const, prefetch: loaders.admin }] : []),
    { href: '/account', label: t('nav.account'), icon: 'user', prefetch: loaders.account },
  ];

  /** Ask before an in-app navigation throws away unsaved editor changes. */
  const guard = (e: MouseEvent): void => {
    if (dirtyCount.value === 0) return;
    const a = (e.target as HTMLElement).closest('a[href]');
    if (!a || a.getAttribute('target') === '_blank' || e.defaultPrevented) return;
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('/') && !href.startsWith('~') && !href.startsWith('#')) return;
    if (!window.confirm(t('common.leave_confirm'))) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div class="shell" onClickCapture={guard}>
      <a class="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>
        {t('nav.skip')}
      </a>
      <header class="topbar">
        <button type="button" class="menu-btn" aria-label={t('nav.menu')} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}>
          <Icon name="menu" size={22} />
        </button>
        <Brand />
      </header>
      <aside id="sidebar" class={`sidebar${open ? ' is-open' : ''}`}>
        <Brand />
        <nav aria-label={t('nav.main')} class="nav">
          {items.map((i) => {
            const active = location === i.href || location.startsWith(`${i.href}/`);
            return (
              <Link key={i.href} href={i.href} class={`nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} {...prefetchOnIntent(i.prefetch)}>
                <Icon name={i.icon} />
                {i.label}
              </Link>
            );
          })}
        </nav>
        <div class="sidebar-user">
          <span class="avatar" aria-hidden="true">
            {(me.data?.email ?? displayClaims.value.email ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span class="sidebar-email" title={me.data?.email}>
            {me.data?.email ?? displayClaims.value.email ?? ''}
          </span>
        </div>
      </aside>
      {open && <div class="scrim" role="presentation" onClick={() => setOpen(false)} />}
      <main id="main" ref={main} tabIndex={-1} class="main">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
