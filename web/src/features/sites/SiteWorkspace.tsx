import { Suspense } from 'preact/compat';
import { Link, useLocation } from 'wouter-preact';
import { useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import { isApiError } from '../../api/errors';
import { ErrorBoundary } from '../../app/ErrorBoundary';
import { t } from '../../i18n';
import { Badge } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { PageSkeleton, Skeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { TabPanel, Tabs } from '../../ui/Tabs';
import { getSite } from './api';
import { TABS, tabById } from './tabs';
import './sites.css';

/** Rendered inside a nested route `/sites/:id`, so `useLocation()` is relative to the site. */
export default function SiteWorkspace({ id }: { id: string }) {
  const [loc, navigate] = useLocation();
  const site = useQuery(K.site(id), () => getSite(id));
  const segment = loc.split('/')[1] ?? '';
  const tab = tabById(segment || 'overview');
  const sub = loc.slice(tab.id.length + 1);

  if (isApiError(site.error) && site.error.status === 404) {
    return (
      <div class="page">
        <EmptyState
          icon="sites"
          title={t('sites.not_found')}
          action={
            <Link href="~/sites" class="btn btn-primary btn-md">
              {t('sites.back')}
            </Link>
          }
        />
      </div>
    );
  }
  if (site.error !== undefined && !site.data) {
    return (
      <div class="page">
        <ErrorState error={site.error} onRetry={() => void site.refetch()} />
      </div>
    );
  }

  const Panel = tab.Component;
  return (
    <div class="page page-wide">
      <header class="workspace-head">
        <Link href="~/sites" class="back-link">
          <Icon name="chevronLeft" size={16} /> {t('sites.title')}
        </Link>
        {site.data ? (
          <div class="workspace-title">
            <h1>{site.data.name}</h1>
            <Badge tone={site.data.status === 'active' ? 'success' : 'warning'}>
              {site.data.status === 'active' ? t('status.active') : t('status.paused')}
            </Badge>
          </div>
        ) : (
          <Skeleton height={34} width={260} />
        )}
      </header>
      <Tabs
        label={t('sites.sections')}
        active={tab.id}
        onNavigate={navigate}
        items={TABS.map((x) => ({
          id: x.id,
          label: t(x.label),
          href: x.id === 'overview' ? '/' : `/${x.id}`,
          prefetch: x.load,
        }))}
      />
      <TabPanel active={tab.id}>
        {site.data ? (
          <ErrorBoundary key={tab.id}>
            <Suspense fallback={<PageSkeleton />}>
              <Panel site={site.data} sub={sub} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <PageSkeleton />
        )}
      </TabPanel>
    </div>
  );
}
