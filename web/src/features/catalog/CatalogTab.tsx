import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { useMutation, useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { ItemStored } from '../../api/types';
import { formatMoney, t } from '../../i18n';
import { Button, IconButton } from '../../ui/Button';
import { Badge, Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SubNav } from '../../ui/SubNav';
import { toastSuccess } from '../../ui/toast';
import { useMe } from '../account/useMe';
import type { TabProps } from '../sites/tabs';
import { createItem, deleteItem, listItems, updateItem } from './api';
import { ItemEditor } from './ItemEditor';
import { defaultItem } from './model';
import { PricingCalendar } from './PricingCalendar';

function ItemList({ siteId }: { siteId: string }) {
  const items = useQuery(K.items(siteId), () => listItems(siteId));
  const me = useMe();
  const [, navigate] = useLocation();
  const [removing, setRemoving] = useState<ItemStored | null>(null);
  const del = useMutation((i: ItemStored) => deleteItem(siteId, i.item_id), {
    invalidate: [K.items(siteId)],
    onSuccess: () => {
      toastSuccess(t('catalog.deleted'));
      setRemoving(null);
    },
  });
  const max = me.data?.limits.max_items_per_site ?? Number.POSITIVE_INFINITY;
  const count = items.data?.length ?? 0;
  const atLimit = count >= max;
  return (
    <Card
      title={t('tab.catalog')}
      description={me.data ? t('catalog.usage', { n: count, max }) : undefined}
      actions={
        <Button variant="primary" icon="plus" disabled={atLimit} onClick={() => navigate('/catalog/new')}>
          {t('catalog.new')}
        </Button>
      }
    >
      {atLimit && <p class="notice">{t('catalog.limit_reached')}</p>}
      {items.loading ? (
        <SkeletonRows rows={4} height={64} />
      ) : items.error !== undefined && !items.data ? (
        <ErrorState error={items.error} onRetry={() => void items.refetch()} />
      ) : count === 0 ? (
        <EmptyState icon="box" title={t('catalog.empty_title')} text={t('catalog.empty_text')} />
      ) : (
        <ul class="list">
          {items.data?.map((i) => (
            <li key={i.item_id} class="list-row">
              <Link href={`/catalog/${i.item_id}`} class="list-main">
                <strong>{i.name}</strong>
                <span class="muted">
                  {t(`catalog.type.${i.type}`)} · {formatMoney(i.price_cents)} · /{i.slug}
                </span>
              </Link>
              <Badge tone={i.active ? 'success' : 'neutral'}>{i.active ? t('status.active') : t('status.inactive')}</Badge>
              <IconButton icon="trash" label={t('common.delete')} onClick={() => setRemoving(i)} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t('common.delete')}
        message={t('catalog.delete_confirm', { name: removing?.name ?? '' })}
        confirmLabel={t('common.delete')}
        pending={del.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void del.run(removing)}
      />
    </Card>
  );
}

function ItemDetail({ siteId, itemId, view }: { siteId: string; itemId: string; view: 'edit' | 'pricing' }) {
  const items = useQuery(K.items(siteId), () => listItems(siteId));
  const stored = items.data?.find((i) => i.item_id === itemId);
  if (items.loading) return <SkeletonRows rows={5} height={56} />;
  if (!stored) return <EmptyState icon="box" title={t('catalog.not_found')} />;
  return (
    <div class="stack-lg">
      <SubNav
        label={stored.name}
        active={view}
        items={[
          { id: 'edit', href: `/catalog/${itemId}`, label: t('catalog.sub.edit') },
          { id: 'pricing', href: `/catalog/${itemId}/pricing`, label: t('catalog.sub.pricing') },
        ]}
      />
      {view === 'pricing' ? (
        <PricingCalendar siteId={siteId} item={stored} />
      ) : (
        <ItemEditor key={stored.updated_at} siteId={siteId} stored={stored} initial={defaultItem()} save={(config) => updateItem(siteId, itemId, config)} onSaved={() => undefined} />
      )}
    </div>
  );
}

export default function CatalogTab({ site, sub }: TabProps) {
  const [, navigate] = useLocation();
  const [head, view] = sub.split('/').filter(Boolean);
  if (head === 'new') {
    return (
      <>
        <Link href="/catalog" class="back-link">
          {t('common.back')}
        </Link>
        <ItemEditor
          siteId={site.site_id}
          stored={null}
          initial={defaultItem()}
          save={(config) => createItem(site.site_id, config)}
          onSaved={() => {
            toastSuccess(t('catalog.created'));
            navigate('/catalog');
          }}
        />
      </>
    );
  }
  if (head) {
    return (
      <>
        <Link href="/catalog" class="back-link">
          {t('common.back')}
        </Link>
        <ItemDetail siteId={site.site_id} itemId={head} view={view === 'pricing' ? 'pricing' : 'edit'} />
      </>
    );
  }
  return <ItemList siteId={site.site_id} />;
}
