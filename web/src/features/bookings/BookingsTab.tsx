import { useMemo, useState } from 'preact/hooks';
import { usePaged } from '../../api/hooks';
import { describeError } from '../../api/messages';
import { K } from '../../api/keys';
import type { Booking, BookingStatus } from '../../api/types';
import { formatDateTime, formatMoney, t } from '../../i18n';
import { Badge, Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Segmented } from '../../ui/Segmented';
import { LoadMore } from '../../ui/Pagination';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Table } from '../../ui/Table';
import type { Column } from '../../ui/Table';
import { toast, toastSuccess } from '../../ui/toast';
import type { TabProps } from '../sites/tabs';
import { listBookings, setBookingStatus } from './api';

const STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED'];
type Filter = 'all' | BookingStatus;
const TONE: Record<BookingStatus, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PAID: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

export default function BookingsTab({ site }: TabProps) {
  const siteId = site.site_id;
  const list = usePaged<Booking>(K.bookings(siteId), (cursor) => listBookings(siteId, cursor));
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.items.filter(
      (b) => (filter === 'all' || b.status === filter) && (!q || `${b.name} ${b.email} ${b.item_name}`.toLowerCase().includes(q)),
    );
  }, [list.items, filter, query]);

  async function change(b: Booking, status: BookingStatus): Promise<void> {
    setBusy(true);
    const swap = (s: BookingStatus) => (items: Booking[]) => items.map((x) => (x.booking_id === b.booking_id ? { ...x, status: s } : x));
    list.update(swap(status));
    try {
      await setBookingStatus(siteId, b.booking_id, status);
      toastSuccess(t('bookings.updated'));
    } catch (e) {
      list.update(swap(b.status));
      toast('error', describeError(e));
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  }

  const columns: Column<Booking>[] = [
    { key: 'created', header: t('common.date'), cell: (b) => formatDateTime(b.created_at), class: 'nowrap' },
    { key: 'item', header: t('bookings.item'), cell: (b) => b.item_name },
    {
      key: 'period',
      header: t('bookings.period'),
      cell: (b) => (
        <span class="nowrap">
          {b.start}
          {b.end !== b.start ? ` → ${b.end}` : ''}
          {b.slot ? ` · ${b.slot}` : ''}
        </span>
      ),
    },
    { key: 'guests', header: t('bookings.guests'), cell: (b) => b.guests, align: 'right' },
    {
      key: 'guest',
      header: t('bookings.customer'),
      cell: (b) => (
        <span class="stack-xs">
          <strong>{b.name}</strong>
          <a href={`mailto:${b.email}`}>{b.email}</a>
          {b.phone && <span class="muted">{b.phone}</span>}
        </span>
      ),
    },
    { key: 'total', header: t('bookings.total'), cell: (b) => formatMoney(b.total_cents, b.currency.toUpperCase()), align: 'right', class: 'nowrap' },
    { key: 'status', header: t('common.status'), cell: (b) => <Badge tone={TONE[b.status]}>{t(`bookings.status.${b.status}`)}</Badge> },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (b) =>
        b.status === 'CANCELLED' ? (
          <span class="muted">—</span>
        ) : (
          <select
            class="select-sm"
            aria-label={t('bookings.change_status', { name: b.name })}
            value=""
            disabled={busy}
            onChange={(e) => {
              const next = e.currentTarget.value as BookingStatus;
              e.currentTarget.value = '';
              if (next === 'CANCELLED') setCancelling(b);
              else if (next) void change(b, next);
            }}
          >
            <option value="">{t('bookings.set_status')}</option>
            {STATUSES.filter((s) => s !== b.status).map((s) => (
              <option key={s} value={s}>
                {t(`bookings.status.${s}`)}
              </option>
            ))}
          </select>
        ),
    },
  ];

  return (
    <Card
      title={t('tab.bookings')}
      actions={
        <input
          type="search"
          class="search"
          aria-label={t('common.search')}
          placeholder={t('common.search')}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      }
    >
      <div class="toolbar">
        <Segmented<Filter>
          label={t('common.status')}
          hideLabel
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: t('common.all') }, ...STATUSES.map((s) => ({ value: s, label: t(`bookings.status.${s}`) }))]}
        />
      </div>
      {list.loading ? (
        <SkeletonRows rows={5} />
      ) : list.error !== undefined ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="calendar" title={t('bookings.empty_title')} text={list.hasMore ? t('inbox.empty_filtered_more') : t('bookings.empty_text')} />
      ) : (
        <Table caption={t('tab.bookings')} columns={columns} rows={rows} rowKey={(b) => b.booking_id} />
      )}
      {!list.loading && list.items.length > 0 && <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={() => void list.loadMore()} />}
      <ConfirmDialog
        open={cancelling !== null}
        title={t('bookings.cancel_title')}
        message={t('bookings.cancel_confirm')}
        confirmLabel={t('bookings.cancel_action')}
        pending={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && void change(cancelling, 'CANCELLED')}
      />
    </Card>
  );
}
