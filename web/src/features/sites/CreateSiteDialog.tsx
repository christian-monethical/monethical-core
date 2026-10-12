import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { isApiError } from '../../api/errors';
import { useMutation } from '../../api/hooks';
import { K } from '../../api/keys';
import { describeError } from '../../api/messages';
import { t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextInput } from '../../ui/Field';
import { TagInput } from '../../ui/TagInput';
import { toastSuccess } from '../../ui/toast';
import { createSite } from './api';
import { MAX_DOMAINS, normalizeDomain, validateDomain } from './domains';

/** Mounted only while open, so its state resets every time. */
export function CreateSiteDialog({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string>();
  const [domainError, setDomainError] = useState<string>();

  const create = useMutation(createSite, {
    invalidate: [K.sites],
    toastError: false,
    onSuccess: (site) => {
      toastSuccess(t('sites.created'));
      onClose();
      navigate(`/sites/${site.site_id}`);
    },
  });

  async function submit(e: Event): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    setNameError(trimmed ? undefined : t('rules.required'));
    setDomainError(domains.length ? undefined : t('sites.domains_required'));
    if (trimmed && domains.length > 0) await create.run({ name: trimmed, domains });
  }

  const serverError = isApiError(create.error) ? create.error : undefined;

  return (
    <Dialog
      open
      title={t('sites.new')}
      onClose={onClose}
      dismissable={!create.pending}
      footer={
        <>
          <Button onClick={onClose} disabled={create.pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="create-site" loading={create.pending}>
            {t('sites.create')}
          </Button>
        </>
      }
    >
      <form id="create-site" class="stack" onSubmit={(e) => void submit(e)} noValidate>
        <TextInput
          label={t('sites.name')}
          value={name}
          maxLength={120}
          required
          data-autofocus
          error={nameError ?? serverError?.fieldErrors.name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <TagInput
          label={t('sites.domains')}
          values={domains}
          onChange={setDomains}
          normalize={normalizeDomain}
          validate={validateDomain}
          max={MAX_DOMAINS}
          placeholder="www.example.com"
          hint={t('sites.domains_hint')}
          error={domainError}
        />
        {create.error !== undefined && (
          <p class="field-error" role="alert">
            {describeError(create.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
