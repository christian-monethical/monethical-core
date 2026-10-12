import { useState } from 'preact/hooks';
import { usePaged } from '../../api/hooks';
import { describeError } from '../../api/messages';
import { K } from '../../api/keys';
import type { Consent } from '../../api/types';
import { formatDateTime, t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Badge, Card } from '../../ui/Card';
import { LoadMore } from '../../ui/Pagination';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Table } from '../../ui/Table';
import { toast } from '../../ui/toast';
import type { TabProps } from '../sites/tabs';
import { downloadConsentsCsv, listConsents } from './api';

const flag = (on: boolean) => <Badge tone={on ? 'success' : 'neutral'}>{on ? t('common.yes') : t('common.no')}</Badge>;

export default function ConsentsTab({ site }: TabProps) {
  const siteId = site.site_id;
  const list = usePaged<Consent>(K.consents(siteId), (cursor) => listConsents(siteId, cursor));
  const [exporting, setExporting] = useState(false);

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      await downloadConsentsCsv(siteId);
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card
      title={t('tab.consents')}
      description={t('consents.description')}
      actions={
        <Button icon="download" loading={exporting} onClick={() => void exportCsv()}>
          {t('consents.export')}
        </Button>
      }
    >
      {list.loading ? (
        <SkeletonRows rows={6} />
      ) : list.error !== undefined ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} />
      ) : list.items.length === 0 ? (
        <EmptyState icon="shield" title={t('consents.empty_title')} text={t('consents.empty_text')} />
      ) : (
        <>
          <Table
            caption={t('tab.consents')}
            rows={list.items}
            rowKey={(c) => c.consent_id}
            columns={[
              { key: 'date', header: t('common.date'), cell: (c) => formatDateTime(c.created_at), class: 'nowrap' },
              { key: 'ver', header: t('consents.version'), cell: (c) => `v${c.banner_version}`, align: 'right' },
              { key: 'pref', header: t('banner.cat.preferences'), cell: (c) => flag(c.preferences) },
              { key: 'an', header: t('banner.cat.analytics'), cell: (c) => flag(c.analytics) },
              { key: 'mk', header: t('banner.cat.marketing'), cell: (c) => flag(c.marketing) },
              { key: 'ip', header: 'IP', cell: (c) => <span class="mono">{c.ip_prefix ?? '—'}</span> },
              { key: 'ua', header: 'User agent', cell: (c) => <span class="clamp">{c.user_agent ?? '—'}</span> },
            ]}
          />
          <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={() => void list.loadMore()} />
        </>
      )}
    </Card>
  );
}
