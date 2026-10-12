import { displayClaims, logout } from '../../auth/session';
import { lang, setLang, t } from '../../i18n';
import type { Lang } from '../../i18n';
import { Button } from '../../ui/Button';
import { Badge, Card, PageHeader } from '../../ui/Card';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { useMe } from './useMe';

export default function AccountPage() {
  const me = useMe();
  return (
    <div class="page">
      <PageHeader title={t('account.title')} />
      <div class="stack-lg">
        <Card title={t('account.profile')}>
          {me.loading ? (
            <Skeleton height={64} />
          ) : me.error !== undefined && !me.data ? (
            <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          ) : (
            <dl class="kv">
              <div>
                <dt>Email</dt>
                <dd>{me.data?.email ?? displayClaims.value.email}</dd>
              </div>
              <div>
                <dt>{t('account.role')}</dt>
                <dd>{me.data?.is_staff ? <Badge tone="info">Staff</Badge> : t('account.customer')}</dd>
              </div>
            </dl>
          )}
        </Card>
        <Card title={t('account.plan')} description={t('account.plan_hint')}>
          {me.data ? (
            <>
              <p>
                <Badge tone="success">{me.data.plan_name}</Badge>
              </p>
              <dl class="kv kv-grid">
                <div>
                  <dt>{t('account.limit.sites')}</dt>
                  <dd>{me.data.limits.max_sites}</dd>
                </div>
                <div>
                  <dt>{t('account.limit.forms')}</dt>
                  <dd>{me.data.limits.max_forms_per_site}</dd>
                </div>
                <div>
                  <dt>{t('account.limit.surveys')}</dt>
                  <dd>{me.data.limits.max_surveys_per_site}</dd>
                </div>
                <div>
                  <dt>{t('account.limit.items')}</dt>
                  <dd>{me.data.limits.max_items_per_site}</dd>
                </div>
              </dl>
            </>
          ) : (
            <Skeleton height={80} />
          )}
        </Card>
        <Card title={t('account.preferences')}>
          <Segmented<Lang>
            label={t('account.language')}
            value={lang.value}
            onChange={(l) => void setLang(l)}
            options={[
              { value: 'it', label: 'Italiano' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Card>
        <Card>
          <Button icon="logout" onClick={logout}>
            {t('account.signout')}
          </Button>
        </Card>
      </div>
    </div>
  );
}
