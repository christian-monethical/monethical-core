import { useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { Site } from '../../api/types';
import { t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Badge, PageHeader } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { SkeletonCards } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { useMe } from '../account/useMe';
import { listSites } from './api';
import { CreateSiteDialog } from './CreateSiteDialog';
import './sites.css';

function SiteCard({ site }: { site: Site }) {
  const shown = site.domains.slice(0, 2);
  const more = site.domains.length - shown.length;
  return (
    <Link href={`/sites/${site.site_id}`} class="site-card">
      <span class="site-card-top">
        <span class="site-avatar" aria-hidden="true">
          {site.name.slice(0, 1).toUpperCase()}
        </span>
        <Badge tone={site.status === 'active' ? 'success' : 'warning'}>
          {site.status === 'active' ? t('status.active') : t('status.paused')}
        </Badge>
      </span>
      <strong class="site-card-name">{site.name}</strong>
      <span class="site-card-domains">
        {shown.map((d) => (
          <span key={d} class="muted">
            {d}
          </span>
        ))}
        {more > 0 && <span class="muted">{t('sites.more_domains', { n: more })}</span>}
      </span>
    </Link>
  );
}

export default function SitesPage() {
  const sites = useQuery(K.sites, listSites);
  const me = useMe();
  const [creating, setCreating] = useState(false);

  const count = sites.data?.length ?? 0;
  const limit = me.data?.max_sites;
  const atLimit = limit !== undefined && count >= limit;

  return (
    <div class="page">
      <PageHeader
        title={t('sites.title')}
        subtitle={limit !== undefined ? t('sites.usage', { n: count, max: limit, plan: me.data?.plan_name ?? '' }) : undefined}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={atLimit}>
            {t('sites.new')}
          </Button>
        }
      />
      {atLimit && (
        <p class="notice" role="status">
          <Icon name="lock" size={16} /> {t('sites.limit_reached')}
        </p>
      )}
      {sites.loading ? (
        <SkeletonCards count={3} height={132} />
      ) : sites.error !== undefined && !sites.data ? (
        <ErrorState error={sites.error} onRetry={() => void sites.refetch()} />
      ) : count === 0 ? (
        <EmptyState
          icon="sites"
          title={t('sites.empty_title')}
          text={t('sites.empty_text')}
          action={
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {t('sites.new')}
            </Button>
          }
        />
      ) : (
        <ul class="card-grid" aria-label={t('sites.title')}>
          {sites.data?.map((s) => (
            <li key={s.site_id}>
              <SiteCard site={s} />
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateSiteDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
