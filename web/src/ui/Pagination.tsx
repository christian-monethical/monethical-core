import { t } from '../i18n';
import { Button } from './Button';

interface Props {
  shown: number;
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}

/** Cursor pagination: "load more" plus the number of rows already loaded. */
export function LoadMore({ shown, hasMore, loading, onMore }: Props) {
  return (
    <div class="pagination">
      <span class="muted" aria-live="polite">
        {t('common.loaded', { n: shown })}
      </span>
      {hasMore && (
        <Button loading={loading} onClick={onMore}>
          {t('common.load_more')}
        </Button>
      )}
    </div>
  );
}
