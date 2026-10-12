import type { ComponentChildren } from 'preact';
import { Link } from 'wouter-preact';
import { prefetchOnIntent } from '../app/prefetch';

export interface TabItem {
  id: string;
  label: string;
  href: string;
  /** Warms the chunk of the panel on hover/focus. */
  prefetch?: () => unknown;
  badge?: string | number;
}

interface Props {
  label: string;
  items: TabItem[];
  active: string;
  onNavigate: (href: string) => void;
}

/**
 * ARIA tabs whose panels are routes: each tab is a real link (middle-click, copy URL, no-JS friendly)
 * with role=tab, roving tabindex and Arrow/Home/End keys.
 */
export function Tabs({ label, items, active, onNavigate }: Props) {
  const onKeyDown = (e: KeyboardEvent, index: number): void => {
    const last = items.length - 1;
    const target =
      e.key === 'ArrowRight' ? (index + 1) % items.length
      : e.key === 'ArrowLeft' ? (index - 1 + items.length) % items.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1;
    const item = items[target];
    if (!item) return;
    e.preventDefault();
    onNavigate(item.href);
    document.getElementById(`tab-${item.id}`)?.focus();
  };

  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {items.map((it, i) => (
        <Link
          key={it.id}
          id={`tab-${it.id}`}
          href={it.href}
          role="tab"
          aria-selected={it.id === active}
          aria-controls="tabpanel"
          tabIndex={it.id === active ? 0 : -1}
          class={`tab${it.id === active ? ' is-active' : ''}`}
          onKeyDown={(e: KeyboardEvent) => onKeyDown(e, i)}
          {...prefetchOnIntent(it.prefetch)}
        >
          {it.label}
          {it.badge !== undefined && <span class="tab-badge">{it.badge}</span>}
        </Link>
      ))}
    </div>
  );
}

export function TabPanel({ active, children }: { active: string; children: ComponentChildren }) {
  return (
    <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${active}`} tabIndex={-1}>
      {children}
    </div>
  );
}
