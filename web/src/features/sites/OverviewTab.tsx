import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { optimistic, patchCache, useMutation, useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { Site } from '../../api/types';
import { config } from '../../env';
import { t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CopyButton } from '../../ui/CopyButton';
import { TextInput } from '../../ui/Field';
import { Switch } from '../../ui/Switch';
import { TagInput } from '../../ui/TagInput';
import { toastSuccess, toast } from '../../ui/toast';
import { describeError } from '../../api/messages';
import { listForms } from '../forms/api';
import { listItems } from '../catalog/api';
import { listSurveys } from '../surveys/api';
import { deleteSite, updateSite } from './api';
import { MAX_DOMAINS, normalizeDomain, validateDomain } from './domains';
import { EmbedCard } from './EmbedCard';
import { useUnsavedGuard } from '../../ui/useUnsaved';
import type { TabProps } from './tabs';
import { store } from '../../api/cache';

function StatusCard({ site }: { site: Site }) {
  const active = site.status === 'active';
  const toggle = async (next: boolean): Promise<void> => {
    const status = next ? 'active' : 'paused';
    const patch = (s: Site): Site => ({ ...s, status });
    try {
      await optimistic(
        [
          patchCache<Site>(K.site(site.site_id), patch),
          patchCache<Site[]>(K.sites, (list) => list.map((s) => (s.site_id === site.site_id ? patch(s) : s))),
        ],
        () => updateSite(site.site_id, { status }),
      );
      toastSuccess(next ? t('overview.activated') : t('overview.paused'));
    } catch (e) {
      toast('error', describeError(e));
    }
  };
  return (
    <Card title={t('overview.status')} description={t('overview.status_hint')}>
      <Switch
        checked={active}
        onChange={(v) => void toggle(v)}
        label={active ? t('status.active') : t('status.paused')}
        hint={active ? t('overview.active_hint') : t('overview.paused_hint')}
      />
    </Card>
  );
}

function DetailsCard({ site }: { site: Site }) {
  const [name, setName] = useState(site.name);
  const [domains, setDomains] = useState(site.domains);
  const dirty = name.trim() !== site.name || domains.join('|') !== site.domains.join('|');
  useUnsavedGuard(dirty);

  const save = useMutation((): Promise<Site> => updateSite(site.site_id, { name: name.trim(), domains }), {
    invalidate: [K.sites],
    onSuccess: (saved) => {
      store.set(K.site(site.site_id), saved);
      toastSuccess(t('common.saved_toast'));
    },
  });

  return (
    <Card title={t('overview.details')}>
      <div class="stack">
        <TextInput
          label={t('sites.name')}
          value={name}
          maxLength={120}
          error={name.trim() ? undefined : t('rules.required')}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <TagInput
          label={t('sites.domains')}
          values={domains}
          onChange={setDomains}
          normalize={normalizeDomain}
          validate={validateDomain}
          max={MAX_DOMAINS}
          hint={t('sites.domains_hint')}
          error={domains.length === 0 ? t('sites.domains_required') : undefined}
        />
        <div class="row row-end">
          <Button
            onClick={() => {
              setName(site.name);
              setDomains(site.domains);
            }}
            disabled={!dirty}
          >
            {t('common.discard')}
          </Button>
          <Button
            variant="primary"
            loading={save.pending}
            disabled={!dirty || !name.trim() || domains.length === 0}
            onClick={() => void save.run(undefined)}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DangerCard({ site }: { site: Site }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const del = useMutation(() => deleteSite(site.site_id), {
    invalidate: [K.sites],
    onSuccess: () => {
      toastSuccess(t('overview.deleted'));
      navigate('~/sites');
    },
  });
  return (
    <Card title={t('overview.danger')} description={t('overview.danger_hint')}>
      <Button variant="danger" icon="trash" onClick={() => setOpen(true)}>
        {t('overview.delete')}
      </Button>
      <ConfirmDialog
        open={open}
        title={t('overview.delete')}
        message={t('overview.delete_confirm', { name: site.name })}
        confirmLabel={t('overview.delete')}
        pending={del.pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => void del.run(undefined)}
      />
    </Card>
  );
}

export default function OverviewTab({ site }: TabProps) {
  const id = site.site_id;
  const forms = useQuery(K.forms(id), () => listForms(id));
  const surveys = useQuery(K.surveys(id), () => listSurveys(id));
  const items = useQuery(K.items(id), () => listItems(id));
  return (
    <div class="stack-lg">
      <div class="grid-2 align-start">
        <StatusCard site={site} />
        <Card title={t('overview.site_key')} description={t('overview.site_key_hint')}>
          <div class="code-row">
            <code class="code-inline">{site.site_key}</code>
            <CopyButton text={site.site_key} />
          </div>
        </Card>
      </div>
      <EmbedCard
        edgeUrl={config.edgeUrl}
        siteKey={site.site_key}
        forms={forms.data ?? []}
        surveys={surveys.data ?? []}
        items={items.data ?? []}
      />
      <DetailsCard key={site.updated_at} site={site} />
      <DangerCard site={site} />
    </div>
  );
}
