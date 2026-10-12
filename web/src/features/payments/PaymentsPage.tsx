import { useMemo, useState } from 'preact/hooks';
import { useMutation, useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import { describeError } from '../../api/messages';
import { isApiError } from '../../api/errors';
import { t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Badge, Card, PageHeader } from '../../ui/Card';
import { Select, TextInput } from '../../ui/Field';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { listSites } from '../sites/api';
import { getStripeStatus, startOnboarding } from './api';

const concreteDomains = (domains: string[]): string[] => domains.filter((d) => !d.startsWith('*.') && d !== 'localhost' && d !== '127.0.0.1');

export default function PaymentsPage() {
  const status = useQuery(K.stripe, getStripeStatus, 10_000);
  const sites = useQuery(K.sites, listSites);
  const domains = useMemo(() => [...new Set((sites.data ?? []).flatMap((s) => concreteDomains(s.domains)))], [sites.data]);
  const [domain, setDomain] = useState('');
  const [path, setPath] = useState('/');
  const chosen = domain || domains[0] || '';
  const returnUrl = chosen ? `https://${chosen}${path.startsWith('/') ? path : `/${path}`}` : '';

  const connect = useMutation(() => startOnboarding(returnUrl, returnUrl), {
    toastError: false,
    onSuccess: (url) => {
      if (url.startsWith('https://')) window.location.assign(url);
    },
  });

  const s = status.data;
  return (
    <div class="page">
      <PageHeader title={t('payments.title')} subtitle={t('payments.subtitle')} />
      <div class="stack-lg">
        <Card title={t('payments.status')} actions={<Button size="sm" icon="refresh" onClick={() => void status.refetch()} loading={status.refreshing}>{t('common.refresh')}</Button>}>
          {status.loading ? (
            <Skeleton height={48} />
          ) : status.error !== undefined && !s ? (
            <ErrorState error={status.error} onRetry={() => void status.refetch()} />
          ) : (
            <ul class="status-list">
              <li>
                <span>{t('payments.connected')}</span>
                <Badge tone={s?.connected ? 'success' : 'warning'}>{s?.connected ? t('common.yes') : t('common.no')}</Badge>
              </li>
              <li>
                <span>{t('payments.charges')}</span>
                <Badge tone={s?.charges_enabled ? 'success' : 'warning'}>{s?.charges_enabled ? t('common.yes') : t('common.no')}</Badge>
              </li>
            </ul>
          )}
        </Card>

        {!s?.charges_enabled && (
          <Card title={s?.connected ? t('payments.continue') : t('payments.connect')} description={t('payments.connect_hint')}>
            {domains.length === 0 ? (
              <p class="notice">{t('payments.need_domain')}</p>
            ) : (
              <form
                class="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void connect.run(undefined);
                }}
              >
                <Select label={t('payments.return_domain')} value={chosen} options={domains.map((d) => ({ value: d, label: d }))} onChange={setDomain} />
                <TextInput label={t('payments.return_path')} value={path} onInput={(e) => setPath(e.currentTarget.value)} hint={returnUrl} />
                {connect.error !== undefined && (
                  <p class="field-error" role="alert">
                    {isApiError(connect.error) && connect.error.code === 'invalid_return_url' ? t('err.invalid_return_url') : describeError(connect.error)}
                  </p>
                )}
                <div>
                  <Button variant="primary" type="submit" icon="external" loading={connect.pending}>
                    {s?.connected ? t('payments.continue') : t('payments.connect')}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
