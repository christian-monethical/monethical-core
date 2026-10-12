import type { ComponentChildren } from 'preact';

interface CardProps {
  title?: string;
  description?: string;
  actions?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
}

export function Card({ title, description, actions, children, class: cls }: CardProps) {
  return (
    <section class={`card${cls ? ` ${cls}` : ''}`}>
      {(title || actions) && (
        <header class="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p class="muted">{description}</p>}
          </div>
          {actions && <div class="row">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ComponentChildren;
}) {
  return (
    <header class="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p class="muted">{subtitle}</p>}
      </div>
      {actions && <div class="row">{actions}</div>}
    </header>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ComponentChildren }) {
  return <span class={`badge badge-${tone}`}>{children}</span>;
}
