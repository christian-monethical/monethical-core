import { store } from '../../api/cache';
import { useQuery, usePaged } from '../../api/hooks';
import { K } from '../../api/keys';
import type { NewsletterConfig, Subscriber } from '../../api/types';
import { formatDateTime, t } from '../../i18n';
import { NewsletterPreview } from '../../preview/lazy';
import { Badge, Card } from '../../ui/Card';
import { TextArea, TextInput } from '../../ui/Field';
import { LoadMore } from '../../ui/Pagination';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SubNav } from '../../ui/SubNav';
import { Table } from '../../ui/Table';
import { Switch } from '../../ui/Switch';
import { DEFAULT_SURFACE } from '../design/defaults';
import { EditorShell, SaveBar, Section } from '../design/EditorShell';
import { SurfaceEditor } from '../design/SurfaceEditor';
import { useEditor } from '../design/useEditor';
import type { TabProps } from '../sites/tabs';
import { getNewsletter, listSubscribers, saveNewsletter } from './api';
import { newsletterFromStored, validateNewsletter } from './model';

function NewsletterEditor({ siteId, stored }: { siteId: string; stored: NewsletterConfig }) {
  const { draft, errors, saving, save } = useEditor<NewsletterConfig, NewsletterConfig>({
    initial: stored,
    validate: validateNewsletter,
    save: (config) => saveNewsletter(siteId, config),
    fromStored: newsletterFromStored,
    onSaved: (saved) => store.set(K.newsletter(siteId), saved),
  });
  const c = draft.value;
  const text = (key: 'headline' | 'button_label' | 'email_placeholder', max = 120) => (
    <TextInput label={t(`news.${key}`)} value={c[key]} maxLength={max} error={errors[key]} onInput={(e) => draft.patch({ [key]: e.currentTarget.value })} />
  );
  return (
    <>
      <EditorShell
        controls={
          <>
            <Section title={t('news.section.content')} open>
              <Switch checked={c.enabled} onChange={(enabled) => draft.patch({ enabled })} label={t('news.enabled')} hint={t('news.enabled_hint')} />
              {text('headline')}
              <TextArea label={t('news.subheadline')} value={c.subheadline} maxLength={500} error={errors.subheadline} onInput={(e) => draft.patch({ subheadline: e.currentTarget.value })} />
              {text('email_placeholder')}
              {text('button_label')}
              <TextArea label={t('news.success')} value={c.success_message} maxLength={500} error={errors.success_message} onInput={(e) => draft.patch({ success_message: e.currentTarget.value })} />
            </Section>
            <Section title={t('news.section.privacy')} open>
              <TextArea label={t('news.privacy_text')} value={c.privacy_text} maxLength={500} error={errors.privacy_text} onInput={(e) => draft.patch({ privacy_text: e.currentTarget.value })} />
              <TextInput label={t('news.privacy_url')} type="url" placeholder="https://" value={c.privacy_url ?? ''} error={errors.privacy_url} onInput={(e) => draft.patch({ privacy_url: e.currentTarget.value.trim() || null })} />
            </Section>
            <Section title={t('design.section')}>
              <SurfaceEditor value={c.surface ?? DEFAULT_SURFACE} onChange={(surface) => draft.patch({ surface })} />
            </Section>
          </>
        }
        preview={<NewsletterPreview config={c} />}
      />
      <SaveBar dirty={draft.dirty} saving={saving} onSave={() => void save()} onDiscard={draft.reset} />
    </>
  );
}

function Subscribers({ siteId }: { siteId: string }) {
  const list = usePaged<Subscriber>(K.subscribers(siteId), (cursor) => listSubscribers(siteId, cursor));
  return (
    <Card title={t('news.subscribers')}>
      {list.loading ? (
        <SkeletonRows rows={5} />
      ) : list.error !== undefined ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} />
      ) : list.items.length === 0 ? (
        <EmptyState icon="mail" title={t('news.no_subscribers')} text={t('news.no_subscribers_text')} />
      ) : (
        <>
          <Table
            caption={t('news.subscribers')}
            rows={list.items}
            rowKey={(s) => s.email}
            columns={[
              { key: 'email', header: 'Email', cell: (s) => s.email },
              { key: 'status', header: t('common.status'), cell: (s) => <Badge tone={s.status === 'subscribed' ? 'success' : 'neutral'}>{t(`news.status.${s.status}`)}</Badge> },
              { key: 'date', header: t('common.date'), cell: (s) => formatDateTime(s.created_at), class: 'nowrap' },
            ]}
          />
          <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={() => void list.loadMore()} />
        </>
      )}
    </Card>
  );
}

export default function NewsletterTab({ site, sub }: TabProps) {
  const cfg = useQuery(K.newsletter(site.site_id), () => getNewsletter(site.site_id));
  const subscribers = sub.startsWith('/subscribers');
  return (
    <div class="stack-lg">
      <SubNav
        label={t('tab.newsletter')}
        active={subscribers ? 'subscribers' : 'design'}
        items={[
          { id: 'design', href: '/newsletter', label: t('news.sub.design') },
          { id: 'subscribers', href: '/newsletter/subscribers', label: t('news.subscribers') },
        ]}
      />
      {subscribers ? (
        <Subscribers siteId={site.site_id} />
      ) : cfg.data ? (
        <NewsletterEditor siteId={site.site_id} stored={cfg.data} />
      ) : cfg.error !== undefined ? (
        <ErrorState error={cfg.error} onRetry={() => void cfg.refetch()} />
      ) : (
        <SkeletonRows rows={6} height={56} />
      )}
    </div>
  );
}
