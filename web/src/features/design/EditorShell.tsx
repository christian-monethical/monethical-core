import type { ComponentChildren } from 'preact';
import { t } from '../../i18n';
import { Button } from '../../ui/Button';
import './editor.css';

/** Two columns: structured controls on the left, live preview (sticky) on the right. */
export function EditorShell({ controls, preview }: { controls: ComponentChildren; preview: ComponentChildren }) {
  return (
    <div class="editor">
      <div class="editor-controls">{controls}</div>
      <aside class="editor-preview" aria-label={t('preview.title')}>
        {preview}
      </aside>
    </div>
  );
}

/** Collapsible group of controls. */
export function Section({
  title,
  open = false,
  children,
}: {
  title: string;
  open?: boolean;
  children: ComponentChildren;
}) {
  return (
    <details class="section" open={open}>
      <summary>{title}</summary>
      <div class="section-body stack">{children}</div>
    </details>
  );
}

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  extra?: ComponentChildren;
}

/** Sticky explicit-save bar. Saving is never automatic; leaving with changes asks for confirmation. */
export function SaveBar({ dirty, saving, onSave, onDiscard, saveLabel, extra }: SaveBarProps) {
  return (
    <div class={`savebar${dirty ? ' is-dirty' : ''}`} role="region" aria-label={t('common.save')}>
      <span class="savebar-status" aria-live="polite">
        {dirty ? t('common.unsaved') : t('common.saved')}
      </span>
      <div class="row">
        {extra}
        <Button onClick={onDiscard} disabled={!dirty || saving}>
          {t('common.discard')}
        </Button>
        <Button variant="primary" icon="check" onClick={onSave} loading={saving} disabled={!dirty}>
          {saveLabel ?? t('common.save')}
        </Button>
      </div>
    </div>
  );
}
