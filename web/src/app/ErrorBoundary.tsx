import { Component } from 'preact';
import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

interface Props {
  children: ComponentChildren;
}

/** Catches render errors and failed chunk loads (e.g. after a deploy) with a retry. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div class="empty is-error" role="alert">
        <span class="empty-icon">
          <Icon name="alert" size={26} />
        </span>
        <h3>{t('common.error_title')}</h3>
        <p>{t('common.chunk_error')}</p>
        <Button icon="refresh" onClick={() => window.location.reload()}>
          {t('common.reload')}
        </Button>
      </div>
    );
  }
}
