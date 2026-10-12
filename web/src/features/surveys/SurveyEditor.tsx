import { store } from '../../api/cache';
import { K } from '../../api/keys';
import type { SurveyConfig, SurveyStored } from '../../api/types';
import { t } from '../../i18n';
import { SurveyPreview } from '../../preview/lazy';
import { TextArea, TextInput } from '../../ui/Field';
import { Switch } from '../../ui/Switch';
import { DEFAULT_SURFACE } from '../design/defaults';
import { EditorShell, SaveBar, Section } from '../design/EditorShell';
import { SurfaceEditor } from '../design/SurfaceEditor';
import { useEditor } from '../design/useEditor';
import { QuestionsEditor } from './QuestionsEditor';
import { surveyFromStored, validateSurvey } from './model';

interface Props {
  siteId: string;
  stored: SurveyStored | null;
  initial: SurveyConfig;
  save: (config: SurveyConfig) => Promise<SurveyStored>;
  onSaved: (stored: SurveyStored) => void;
}

export function SurveyEditor({ siteId, stored, initial, save, onSaved }: Props) {
  const { draft, errors, saving, save: submit } = useEditor<SurveyConfig, SurveyStored>({
    initial: stored ? surveyFromStored(stored) : initial,
    validate: validateSurvey,
    save,
    fromStored: surveyFromStored,
    onSaved: (saved) => {
      store.invalidate(K.surveys(siteId));
      onSaved(saved);
    },
  });
  const c = draft.value;
  return (
    <>
      <EditorShell
        controls={
          <>
            <Section title={t('surveys.section.general')} open>
              <TextInput label={t('surveys.title_label')} value={c.title} maxLength={120} required error={errors.title} onInput={(e) => draft.patch({ title: e.currentTarget.value })} />
              <TextArea label={t('surveys.description')} value={c.description} maxLength={500} error={errors.description} onInput={(e) => draft.patch({ description: e.currentTarget.value })} />
              <Switch checked={c.active} onChange={(active) => draft.patch({ active })} label={t('surveys.active')} hint={t('surveys.active_hint')} />
              <TextInput label={t('forms.submit_label')} value={c.submit_label} maxLength={120} error={errors.submit_label} onInput={(e) => draft.patch({ submit_label: e.currentTarget.value })} />
              <TextArea label={t('forms.success')} value={c.success_message} maxLength={500} error={errors.success_message} onInput={(e) => draft.patch({ success_message: e.currentTarget.value })} />
            </Section>
            <Section title={t('surveys.section.questions')} open>
              <QuestionsEditor questions={c.questions ?? []} errors={errors} onChange={(questions) => draft.patch({ questions })} />
            </Section>
            <Section title={t('design.section')}>
              <SurfaceEditor value={c.surface ?? DEFAULT_SURFACE} onChange={(surface) => draft.patch({ surface })} />
            </Section>
          </>
        }
        preview={<SurveyPreview config={c} />}
      />
      <SaveBar dirty={draft.dirty || stored === null} saving={saving} onSave={() => void submit()} onDiscard={draft.reset} saveLabel={stored ? undefined : t('surveys.create')} />
    </>
  );
}
