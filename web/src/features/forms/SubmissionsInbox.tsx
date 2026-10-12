import { useMemo, useState } from 'preact/hooks';
import { usePaged } from '../../api/hooks';
import { describeError } from '../../api/messages';
import { K } from '../../api/keys';
import type { Submission } from '../../api/types';
import { formatDateTime, t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Badge, Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Dialog } from '../../ui/Dialog';
import { Segmented } from '../../ui/Segmented';
import { SkeletonRows } from '../../ui/Skeleton';
import { LoadMore } from '../../ui/Pagination';
import { EmptyState, ErrorState } from '../../ui/States';
import { Table } from '../../ui/Table';
import type { Column } from '../../ui/Table';
import { toast, toastSuccess } from '../../ui/toast';
import { deleteSubmission, listSubmissions, setSubmissionStatus } from './api';

type Filter = 'all' | Submission['status'];
const TONE = { new: 'info', read: 'neutral', archived: 'warning' } as const;

const preview = (s: Submission): string =>
  Object.values(s.data)
    .filter((v): v is string => typeof v === 'string')
    .slice(0, 3)
    .join(' · ');

function Detail({ sub, onStatus, onDelete, onClose }: { sub: Submission; onStatus: (s: Submission['status']) => void; onDelete: () => void; onClose: () => void }) {
  return (
    <Dialog
      open
      title={sub.form_name || t('forms.sub.submissions')}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" icon="trash" onClick={onDelete}>
            {t('common.delete')}
          </Button>
          {sub.status !== 'archived' && <Button onClick={() => onStatus('archived')}>{t('inbox.archive')}</Button>}
          {sub.status !== 'read' && <Button onClick={() => onStatus('read')}>{t('inbox.mark_read')}</Button>}
          {sub.status !== 'new' && <Button onClick={() => onStatus('new')}>{t('inbox.mark_new')}</Button>}
        </>
      }
    >
      <p class="muted">{formatDateTime(sub.created_at)}</p>
      <dl class="kv">
        {Object.entries(sub.data).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{typeof v === 'boolean' ? (v ? t('common.yes') : t('common.no')) : String(v)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

export function SubmissionsInbox({ siteId }: { siteId: string }) {
  const list = usePaged<Submission>(K.submissions(siteId), (cursor) => listSubmissions(siteId, cursor));
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Submission | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(() => list.items.filter((s) => filter === 'all' || s.status === filter), [list.items, filter]);
  const current = list.items.find((s) => s.submission_id === open) ?? null;

  async function changeStatus(sub: Submission, status: Submission['status']): Promise<void> {
    const previous = sub.status;
    list.update((items) => items.map((s) => (s.submission_id === sub.submission_id ? { ...s, status } : s)));
    try {
      await setSubmissionStatus(siteId, sub.submission_id, status);
    } catch (e) {
      list.update((items) => items.map((s) => (s.submission_id === sub.submission_id ? { ...s, status: previous } : s)));
      toast('error', describeError(e));
    }
  }

  async function remove(sub: Submission): Promise<void> {
    setDeleting(true);
    try {
      await deleteSubmission(siteId, sub.submission_id);
      list.update((items) => items.filter((s) => s.submission_id !== sub.submission_id));
      toastSuccess(t('inbox.deleted'));
      setRemoving(null);
      setOpen(null);
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Submission>[] = [
    { key: 'date', header: t('common.date'), cell: (s) => formatDateTime(s.created_at), class: 'nowrap' },
    { key: 'form', header: t('inbox.form'), cell: (s) => s.form_name },
    { key: 'data', header: t('inbox.content'), cell: (s) => <span class="clamp">{preview(s)}</span> },
    { key: 'status', header: t('common.status'), cell: (s) => <Badge tone={TONE[s.status]}>{t(`inbox.status.${s.status}`)}</Badge> },
    {
      key: 'open',
      header: '',
      align: 'right',
      cell: (s) => (
        <Button
          size="sm"
          onClick={() => {
            setOpen(s.submission_id);
            if (s.status === 'new') void changeStatus(s, 'read');
          }}
        >
          {t('common.open')}
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={t('forms.sub.submissions')}
      actions={
        <Segmented<Filter>
          label={t('common.status')}
          hideLabel
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'new', label: t('inbox.status.new') },
            { value: 'read', label: t('inbox.status.read') },
            { value: 'archived', label: t('inbox.status.archived') },
          ]}
        />
      }
    >
      {list.loading ? (
        <SkeletonRows rows={5} />
      ) : list.error !== undefined ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="inbox" title={t('inbox.empty_title')} text={list.hasMore ? t('inbox.empty_filtered_more') : t('inbox.empty_text')} />
      ) : (
        <Table caption={t('forms.sub.submissions')} columns={columns} rows={rows} rowKey={(s) => s.submission_id} />
      )}
      {!list.loading && list.items.length > 0 && <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={() => void list.loadMore()} />}
      {current && (
        <Detail sub={current} onClose={() => setOpen(null)} onStatus={(s) => void changeStatus(current, s)} onDelete={() => setRemoving(current)} />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t('common.delete')}
        message={t('inbox.delete_confirm')}
        confirmLabel={t('common.delete')}
        pending={deleting}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void remove(removing)}
      />
    </Card>
  );
}
