import { useState } from 'preact/hooks';
import { useMutation, useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { KeyCreated, KeyOut, KeyScope } from '../../api/types';
import { formatDateTime, t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Badge, Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Dialog } from '../../ui/Dialog';
import { CopyButton } from '../../ui/CopyButton';
import { TextInput } from '../../ui/Field';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Table } from '../../ui/Table';
import { Checkbox } from '../../ui/Switch';
import { toastSuccess } from '../../ui/toast';
import type { TabProps } from '../sites/tabs';
import { createKey, listKeys, revokeKey, rotateKey } from './api';

const SCOPES: KeyScope[] = ['consents:read', 'submissions:read', 'bookings:read'];
const MAX_KEYS = 5;

/** The plaintext secret exists only here, once. Closing the dialog discards it. */
function SecretDialog({ created, onClose }: { created: KeyCreated; onClose: () => void }) {
  return (
    <Dialog
      open
      title={t('keys.secret_title')}
      onClose={onClose}
      dismissable={false}
      footer={
        <Button variant="primary" onClick={onClose} data-autofocus>
          {t('keys.secret_done')}
        </Button>
      }
    >
      <div class="stack">
        <p class="notice is-warning" role="alert">
          {t('keys.secret_warning')}
        </p>
        <div class="code-row">
          <input class="mono secret" readOnly value={created.secret} aria-label={t('keys.secret')} onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={created.secret} size="md" />
        </div>
        <p class="muted">
          {created.label} · <code>{created.prefix}…</code>
        </p>
      </div>
    </Dialog>
  );
}

function CreateKeyDialog({ siteId, onClose, onCreated }: { siteId: string; onClose: () => void; onCreated: (k: KeyCreated) => void }) {
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState<KeyScope[]>(['consents:read']);
  const [attempted, setAttempted] = useState(false);
  const create = useMutation((p: { label: string; scopes: KeyScope[] }) => createKey(siteId, p), {
    invalidate: [K.keys(siteId)],
    onSuccess: onCreated,
  });
  const labelError = label.trim() ? undefined : t('rules.required');
  const submit = (e: Event): void => {
    e.preventDefault();
    setAttempted(true);
    if (!labelError && scopes.length > 0) void create.run({ label: label.trim(), scopes });
  };
  return (
    <Dialog
      open
      title={t('keys.new')}
      onClose={onClose}
      dismissable={!create.pending}
      footer={
        <>
          <Button onClick={onClose} disabled={create.pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="create-key" loading={create.pending}>
            {t('keys.create')}
          </Button>
        </>
      }
    >
      <form id="create-key" class="stack" onSubmit={submit} noValidate>
        <TextInput label={t('keys.label')} value={label} maxLength={60} required data-autofocus error={attempted ? labelError : undefined} onInput={(e) => setLabel(e.currentTarget.value)} />
        <fieldset class="fieldset">
          <legend>{t('keys.scopes')}</legend>
          {SCOPES.map((s) => (
            <Checkbox
              key={s}
              checked={scopes.includes(s)}
              label={t(`keys.scope.${s}`)}
              hint={s}
              onChange={(on) => setScopes(on ? [...scopes, s] : scopes.filter((x) => x !== s))}
            />
          ))}
          {attempted && scopes.length === 0 && <p class="field-error">{t('keys.scope_required')}</p>}
        </fieldset>
      </form>
    </Dialog>
  );
}

export default function KeysTab({ site }: TabProps) {
  const siteId = site.site_id;
  const keys = useQuery(K.keys(siteId), () => listKeys(siteId));
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<KeyCreated | null>(null);
  const [rotating, setRotating] = useState<KeyOut | null>(null);
  const [revoking, setRevoking] = useState<KeyOut | null>(null);

  const rotate = useMutation((k: KeyOut) => rotateKey(siteId, k.key_id), {
    invalidate: [K.keys(siteId)],
    onSuccess: (created) => {
      setRotating(null);
      setSecret(created);
    },
  });
  const revoke = useMutation((k: KeyOut) => revokeKey(siteId, k.key_id), {
    invalidate: [K.keys(siteId)],
    onSuccess: () => {
      setRevoking(null);
      toastSuccess(t('keys.revoked'));
    },
  });

  const count = keys.data?.length ?? 0;
  return (
    <Card
      title={t('tab.keys')}
      description={t('keys.description', { max: MAX_KEYS })}
      actions={
        <Button variant="primary" icon="plus" disabled={count >= MAX_KEYS} onClick={() => setCreating(true)}>
          {t('keys.new')}
        </Button>
      }
    >
      {keys.loading ? (
        <SkeletonRows rows={3} />
      ) : keys.error !== undefined && !keys.data ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : count === 0 ? (
        <EmptyState icon="key" title={t('keys.empty_title')} text={t('keys.empty_text')} />
      ) : (
        <Table
          caption={t('tab.keys')}
          rows={keys.data ?? []}
          rowKey={(k) => k.key_id}
          columns={[
            { key: 'label', header: t('keys.label'), cell: (k) => <strong>{k.label}</strong> },
            { key: 'prefix', header: t('keys.prefix'), cell: (k) => <code>{k.prefix}…</code> },
            {
              key: 'scopes',
              header: t('keys.scopes'),
              cell: (k) => (
                <span class="row row-wrap">
                  {k.scopes.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </span>
              ),
            },
            { key: 'created', header: t('common.created'), cell: (k) => formatDateTime(k.created_at), class: 'nowrap' },
            { key: 'used', header: t('keys.last_used'), cell: (k) => (k.last_used_at ? formatDateTime(k.last_used_at) : t('keys.never')), class: 'nowrap' },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (k) => (
                <span class="row row-end">
                  <Button size="sm" icon="refresh" onClick={() => setRotating(k)}>
                    {t('keys.rotate')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setRevoking(k)}>
                    {t('keys.revoke')}
                  </Button>
                </span>
              ),
            },
          ]}
        />
      )}
      {creating && (
        <CreateKeyDialog
          siteId={siteId}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            setSecret(created);
          }}
        />
      )}
      {secret && <SecretDialog created={secret} onClose={() => setSecret(null)} />}
      <ConfirmDialog
        open={rotating !== null}
        title={t('keys.rotate')}
        message={t('keys.rotate_confirm', { label: rotating?.label ?? '' })}
        confirmLabel={t('keys.rotate')}
        pending={rotate.pending}
        onCancel={() => setRotating(null)}
        onConfirm={() => rotating && void rotate.run(rotating)}
      />
      <ConfirmDialog
        open={revoking !== null}
        title={t('keys.revoke')}
        message={t('keys.revoke_confirm', { label: revoking?.label ?? '' })}
        confirmLabel={t('keys.revoke')}
        pending={revoke.pending}
        onCancel={() => setRevoking(null)}
        onConfirm={() => revoking && void revoke.run(revoking)}
      />
    </Card>
  );
}
