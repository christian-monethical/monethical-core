import type { ComponentChildren } from 'preact';
import { describeError } from '../api/messages';
import { t } from '../i18n';
import { Button } from './Button';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface EmptyProps {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ComponentChildren;
}

export function EmptyState({ icon = 'inbox', title, text, action }: EmptyProps) {
  return (
    <div class="empty">
      <span class="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div class="empty is-error" role="alert">
      <span class="empty-icon">
        <Icon name="alert" size={26} />
      </span>
      <h3>{t('common.error_title')}</h3>
      <p>{describeError(error)}</p>
      {onRetry && (
        <Button icon="refresh" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
