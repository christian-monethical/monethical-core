import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { useMutation, useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { FormStored } from '../../api/types';
import { t } from '../../i18n';
import { Button, IconButton } from '../../ui/Button';
import { Badge, Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { SkeletonRows } from '../../ui/Skeleton';
import { SubNav } from '../../ui/SubNav';
import { EmptyState, ErrorState } from '../../ui/States';
import { toastSuccess } from '../../ui/toast';
import { useMe } from '../account/useMe';
import type { TabProps } from '../sites/tabs';
import { createForm, deleteForm, listForms, updateForm } from './api';
import { FormEditor } from './FormEditor';
import { defaultForm } from './model';
import { SubmissionsInbox } from './SubmissionsInbox';

function FormList({ siteId }: { siteId: string }) {
  const forms = useQuery(K.forms(siteId), () => listForms(siteId));
  const me = useMe();
  const [, navigate] = useLocation();
  const [removing, setRemoving] = useState<FormStored | null>(null);
  const del = useMutation((f: FormStored) => deleteForm(siteId, f.form_id), {
    invalidate: [K.forms(siteId)],
    onSuccess: () => {
      toastSuccess(t('forms.deleted'));
      setRemoving(null);
    },
  });
  const max = me.data?.limits.max_forms_per_site ?? Number.POSITIVE_INFINITY;
  const count = forms.data?.length ?? 0;
  const atLimit = count >= max;

  return (
    <Card
      title={t('forms.title')}
      description={me.data ? t('forms.usage', { n: count, max }) : undefined}
      actions={
        <Button variant="primary" icon="plus" disabled={atLimit} onClick={() => navigate('/forms/new')}>
          {t('forms.new')}
        </Button>
      }
    >
      {atLimit && <p class="notice">{t('forms.limit_reached')}</p>}
      {forms.loading ? (
        <SkeletonRows rows={3} height={64} />
      ) : forms.error !== undefined && !forms.data ? (
        <ErrorState error={forms.error} onRetry={() => void forms.refetch()} />
      ) : count === 0 ? (
        <EmptyState icon="inbox" title={t('forms.empty_title')} text={t('forms.empty_text')} />
      ) : (
        <ul class="list">
          {forms.data?.map((f) => (
            <li key={f.form_id} class="list-row">
              <Link href={`/forms/${f.form_id}`} class="list-main">
                <strong>{f.name}</strong>
                <span class="muted">{t('forms.summary', { fields: f.fields?.length ?? 0, recipients: f.recipients.length })}</span>
              </Link>
              <Badge tone={f.enabled ? 'success' : 'neutral'}>{f.enabled ? t('status.enabled') : t('status.disabled')}</Badge>
              <IconButton icon="trash" label={t('common.delete')} onClick={() => setRemoving(f)} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t('common.delete')}
        message={t('forms.delete_confirm', { name: removing?.name ?? '' })}
        confirmLabel={t('common.delete')}
        pending={del.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void del.run(removing)}
      />
    </Card>
  );
}

function EditForm({ siteId, formId }: { siteId: string; formId: string }) {
  const forms = useQuery(K.forms(siteId), () => listForms(siteId));
  const [, navigate] = useLocation();
  const stored = forms.data?.find((f) => f.form_id === formId);
  if (forms.loading) return <SkeletonRows rows={5} height={56} />;
  if (!stored) return <EmptyState icon="inbox" title={t('forms.not_found')} action={<Button onClick={() => navigate('/forms')}>{t('common.back')}</Button>} />;
  return (
    <FormEditor
      key={stored.updated_at}
      siteId={siteId}
      stored={stored}
      initial={defaultForm()}
      save={(config) => updateForm(siteId, formId, config)}
      onSaved={() => undefined}
    />
  );
}

export default function FormsTab({ site, sub }: TabProps) {
  const [, navigate] = useLocation();
  const me = useMe();
  const parts = sub.split('/').filter(Boolean);
  const head = parts[0];

  if (head === 'new') {
    return (
      <>
        <Link href="/forms" class="back-link">
          {t('common.back')}
        </Link>
        <FormEditor
          siteId={site.site_id}
          stored={null}
          initial={defaultForm(me.data?.email ?? '')}
          save={(config) => createForm(site.site_id, config)}
          onSaved={() => {
            toastSuccess(t('forms.created'));
            navigate('/forms');
          }}
        />
      </>
    );
  }
  if (head && head !== 'submissions') {
    return (
      <>
        <Link href="/forms" class="back-link">
          {t('common.back')}
        </Link>
        <EditForm siteId={site.site_id} formId={head} />
      </>
    );
  }
  return (
    <div class="stack-lg">
      <SubNav
        label={t('tab.forms')}
        active={head === 'submissions' ? 'submissions' : 'forms'}
        items={[
          { id: 'forms', href: '/forms', label: t('forms.sub.forms') },
          { id: 'submissions', href: '/forms/submissions', label: t('forms.sub.submissions') },
        ]}
      />
      {head === 'submissions' ? <SubmissionsInbox siteId={site.site_id} /> : <FormList siteId={site.site_id} />}
    </div>
  );
}
