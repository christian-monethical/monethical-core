import { store } from '../../api/cache';
import { K } from '../../api/keys';
import type { FormConfig, FormStored } from '../../api/types';
import { t } from '../../i18n';
import { FormPreview } from '../../preview/lazy';
import { TextArea, TextInput } from '../../ui/Field';
import { Switch } from '../../ui/Switch';
import { TagInput } from '../../ui/TagInput';
import { DEFAULT_SURFACE } from '../design/defaults';
import { EditorShell, SaveBar, Section } from '../design/EditorShell';
import { isEmail } from '../design/rules';
import { SurfaceEditor } from '../design/SurfaceEditor';
import { useEditor } from '../design/useEditor';
import { FieldsEditor } from './FieldsEditor';
import { formFromStored, MAX_RECIPIENTS, validateForm } from './model';

interface Props {
  siteId: string;
  /** Existing form, or null for a new one. */
  stored: FormStored | null;
  initial: FormConfig;
  save: (config: FormConfig) => Promise<FormStored>;
  onSaved: (stored: FormStored) => void;
}

export function FormEditor({ siteId, stored, initial, save, onSaved }: Props) {
  const { draft, errors, saving, save: submit } = useEditor<FormConfig, FormStored>({
    initial: stored ? formFromStored(stored) : initial,
    validate: validateForm,
    save,
    fromStored: formFromStored,
    onSaved: (saved) => {
      store.invalidate(K.forms(siteId));
      onSaved(saved);
    },
  });
  const c = draft.value;
  const ar = c.autoresponder ?? { enabled: false, subject: '', body: '' };

  return (
    <>
      <EditorShell
        controls={
          <>
            <Section title={t('forms.section.general')} open>
              <TextInput label={t('forms.name')} value={c.name} maxLength={120} required error={errors.name} onInput={(e) => draft.patch({ name: e.currentTarget.value })} />
              <Switch checked={c.enabled} onChange={(enabled) => draft.patch({ enabled })} label={t('forms.enabled')} hint={t('forms.enabled_hint')} />
              <TextInput label={t('forms.submit_label')} value={c.submit_label} maxLength={120} error={errors.submit_label} onInput={(e) => draft.patch({ submit_label: e.currentTarget.value })} />
              <TextArea label={t('forms.success')} value={c.success_message} maxLength={500} error={errors.success_message} onInput={(e) => draft.patch({ success_message: e.currentTarget.value })} />
            </Section>
            <Section title={t('forms.section.fields')} open>
              <FieldsEditor fields={c.fields ?? []} errors={errors} onChange={(fields) => draft.patch({ fields })} />
            </Section>
            <Section title={t('forms.section.delivery')} open>
              <TagInput
                label={t('forms.recipients')}
                values={c.recipients}
                onChange={(recipients) => draft.patch({ recipients })}
                normalize={(v) => v.trim().toLowerCase()}
                validate={(v) => (isEmail(v) ? null : t('rules.email'))}
                max={MAX_RECIPIENTS}
                placeholder="name@company.com"
                hint={t('forms.recipients_hint')}
                error={errors.recipients}
              />
              <TextInput label={t('forms.subject')} value={c.subject} maxLength={120} hint={t('forms.subject_hint')} error={errors.subject} onInput={(e) => draft.patch({ subject: e.currentTarget.value })} />
            </Section>
            <Section title={t('forms.section.privacy')}>
              <TextArea label={t('forms.privacy_text')} value={c.privacy_text} maxLength={500} error={errors.privacy_text} onInput={(e) => draft.patch({ privacy_text: e.currentTarget.value })} />
              <TextInput label={t('forms.privacy_url')} type="url" placeholder="https://" value={c.privacy_url ?? ''} error={errors.privacy_url} onInput={(e) => draft.patch({ privacy_url: e.currentTarget.value.trim() || null })} />
              <Switch checked={c.privacy_required} onChange={(privacy_required) => draft.patch({ privacy_required })} label={t('forms.privacy_required')} />
            </Section>
            <Section title={t('forms.section.autoresponder')}>
              <Switch checked={ar.enabled} onChange={(enabled) => draft.patch({ autoresponder: { ...ar, enabled } })} label={t('forms.ar_enabled')} hint={t('forms.ar_hint')} />
              {errors['autoresponder.enabled'] && <p class="field-error" role="alert">{errors['autoresponder.enabled']}</p>}
              <TextInput label={t('forms.ar_subject')} value={ar.subject} maxLength={120} error={errors['autoresponder.subject']} onInput={(e) => draft.patch({ autoresponder: { ...ar, subject: e.currentTarget.value } })} />
              <TextArea label={t('forms.ar_body')} value={ar.body} maxLength={2000} rows={5} error={errors['autoresponder.body']} onInput={(e) => draft.patch({ autoresponder: { ...ar, body: e.currentTarget.value } })} />
            </Section>
            <Section title={t('design.section')}>
              <SurfaceEditor value={c.surface ?? DEFAULT_SURFACE} onChange={(surface) => draft.patch({ surface })} />
            </Section>
          </>
        }
        preview={<FormPreview config={c} />}
      />
      <SaveBar dirty={draft.dirty || stored === null} saving={saving} onSave={() => void submit()} onDiscard={draft.reset} saveLabel={stored ? undefined : t('forms.create')} />
    </>
  );
}
