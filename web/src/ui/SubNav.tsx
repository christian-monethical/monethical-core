import { Link } from 'wouter-preact';

interface Item {
  id: string;
  href: string;
  label: string;
}

/** Secondary navigation inside a tab (current page marked with aria-current). */
export function SubNav({ label, items, active }: { label: string; items: Item[]; active: string }) {
  return (
    <nav class="subnav" aria-label={label}>
      {items.map((i) => (
        <Link key={i.id} href={i.href} class={i.id === active ? 'is-active' : ''} aria-current={i.id === active ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
