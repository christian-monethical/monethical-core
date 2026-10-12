import { useMemo } from 'preact/hooks';
import { t } from '../../i18n';
import { Card } from '../../ui/Card';
import { CopyButton } from '../../ui/CopyButton';
import { containerSnippets, scriptTag } from './snippet';
import type { SnippetRefs } from './snippet';

interface Props extends SnippetRefs {
  edgeUrl: string;
  siteKey: string;
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div class="codeblock">
      <div class="codeblock-head">
        <span>{label}</span>
        <CopyButton text={code} />
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard access to a scrollable region (WCAG 2.1.1) */}
      <pre tabIndex={0} aria-label={label}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Embed snippet generator: one loader tag per page plus a container per module. */
export function EmbedCard({ edgeUrl, siteKey, forms, surveys, items }: Props) {
  const snippets = useMemo(() => containerSnippets({ forms, surveys, items }), [forms, surveys, items]);
  return (
    <Card title={t('embed.title')} description={t('embed.description')}>
      <div class="stack">
        {!edgeUrl && <p class="notice">{t('embed.no_edge')}</p>}
        <CodeBlock label={t('embed.loader')} code={scriptTag(edgeUrl || 'https://EDGE_URL', siteKey)} />
        <h3 class="subhead">{t('embed.modules')}</h3>
        {snippets.map((s) => (
          <CodeBlock key={s.id} label={s.label} code={s.code} />
        ))}
      </div>
    </Card>
  );
}
