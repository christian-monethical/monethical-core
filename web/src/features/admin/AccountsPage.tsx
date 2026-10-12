import { useState } from 'preact/hooks';
import { usePaged } from '../../api/hooks';
import { describeError } from '../../api/messages';
import { K } from '../../api/keys';
import type { Account, PlanId } from '../../api/types';
import { formatDate, t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Badge, Card, PageHeader } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { LoadMore } from '../../ui/Pagination';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Table } from '../../ui/Table';
import type { Column } from '../../ui/Table';
import { toast, toastSuccess } from '../../ui/toast';
import { PLAN_OPTIONS } from './plans';
import { listAccounts, updateAccount } from './api';
import { InviteDialog } from './InviteDialog';

export default function AccountsPage() {
  const list = usePaged<Account>(K.accounts, listAccounts);
  const [inviting, setInviting] = useState(false);
  const [toggling, setToggling] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  const replace = (a: Account) => (items: Account[]) => items.map((x) => (x.tenant_id === a.tenant_id ? a : x));

  async function changePlan(a: Account, plan: PlanId): Promise<void> {
    list.update(replace({ ...a, plan }));
    try {
      list.update(replace(await updateAccount(a.tenant_id, { plan })));
      toastSuccess(t('admin.plan_changed'));
    } catch (e) {
      list.update(replace(a));
      toast('error', describeError(e));
    }
  }

  async function toggleStatus(a: Account): Promise<void> {
    setBusy(true);
    try {
      const next = a.status === 'active' ? 'suspended' : 'active';
      list.update(replace(await updateAccount(a.tenant_id, { status: next })));
      toastSuccess(next === 'suspended' ? t('admin.suspended_ok') : t('admin.reactivated_ok'));
      setToggling(null);
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Account>[] = [
    {
      key: 'account',
      header: t('admin.account'),
      cell: (a) => (
        <span class="stack-xs">
          <strong>{a.email}</strong>
          {a.company && <span class="muted">{a.company}</span>}
        </span>
      ),
    },
    {
      key: 'plan',
      header: t('admin.plan'),
      cell: (a) => (
        <select class="select-sm" aria-label={t('admin.plan_of', { email: a.email })} value={a.plan} onChange={(e) => void changePlan(a, e.currentTarget.value as PlanId)}>
          {PLAN_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      ),
    },
    { key: 'status', header: t('common.status'), cell: (a) => <Badge tone={a.status === 'active' ? 'success' : 'danger'}>{a.status === 'active' ? t('status.active') : t('admin.suspended')}</Badge> },
    { key: 'stripe', header: 'Stripe', cell: (a) => <Badge tone={a.stripe_charges_enabled ? 'success' : a.stripe_connected ? 'warning' : 'neutral'}>{a.stripe_charges_enabled ? t('admin.stripe_ready') : a.stripe_connected ? t('admin.stripe_pending') : '—'}</Badge> },
    { key: 'created', header: t('common.created'), cell: (a) => formatDate(a.created_at), class: 'nowrap' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (a) => (
        <Button size="sm" variant={a.status === 'active' ? 'danger' : 'secondary'} onClick={() => setToggling(a)}>
          {a.status === 'active' ? t('admin.suspend') : t('admin.reactivate')}
        </Button>
      ),
    },
  ];

  return (
    <div class="page page-wide">
      <PageHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setInviting(true)}>
            {t('admin.invite')}
          </Button>
        }
      />
      <Card>
        {list.loading ? (
          <SkeletonRows rows={6} />
        ) : list.error !== undefined ? (
          <ErrorState error={list.error} onRetry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState icon="users" title={t('admin.empty')} />
        ) : (
          <>
            <Table caption={t('admin.title')} columns={columns} rows={list.items} rowKey={(a) => a.tenant_id} />
            <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={() => void list.loadMore()} />
          </>
        )}
      </Card>
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onInvited={(a) => {
            setInviting(false);
            list.update((items) => [a, ...items]);
            toastSuccess(t('admin.invited', { email: a.email }));
          }}
        />
      )}
      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.status === 'active' ? t('admin.suspend') : t('admin.reactivate')}
        message={toggling?.status === 'active' ? t('admin.suspend_confirm', { email: toggling.email }) : t('admin.reactivate_confirm', { email: toggling?.email ?? '' })}
        confirmLabel={toggling?.status === 'active' ? t('admin.suspend') : t('admin.reactivate')}
        danger={toggling?.status === 'active'}
        pending={busy}
        onCancel={() => setToggling(null)}
        onConfirm={() => toggling && void toggleStatus(toggling)}
      />
    </div>
  );
}
