import { t } from '../i18n';
import { Icon } from './Icon';
import { dismissToast, toasts } from './toast';

/** Polite live region; errors use role=alert so they are announced immediately. */
export function Toaster() {
  return (
    <div class="toaster" aria-live="polite" aria-atomic="false">
      {toasts.value.map((x) => (
        <div key={x.id} class={`toast toast-${x.kind}`} role={x.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={x.kind === 'error' ? 'alert' : 'check'} size={16} />
          <span>{x.message}</span>
          <button type="button" class="toast-close" aria-label={t('common.close')} onClick={() => dismissToast(x.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
