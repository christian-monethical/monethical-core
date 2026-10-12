import type { Question } from '../../api/types';
import { t } from '../../i18n';
import { Button, IconButton } from '../../ui/Button';
import { NumberInput, Select, TextArea, TextInput } from '../../ui/Field';
import { Checkbox } from '../../ui/Switch';
import type { Errors } from '../design/rules';
import { MAX_QUESTIONS, nextQuestionKey, QUESTION_TYPES } from './model';
import type { QuestionType } from './model';

interface Props {
  questions: Question[];
  errors: Errors;
  onChange: (questions: Question[]) => void;
}

export function QuestionsEditor({ questions, errors, onChange }: Props) {
  const replace = (i: number, q: Question): void => onChange(questions.map((x, j) => (j === i ? q : x)));
  const move = (i: number, delta: number): void => {
    const next = [...questions];
    const [item] = next.splice(i, 1);
    if (item) next.splice(i + delta, 0, item);
    onChange(next);
  };
  return (
    <div class="stack">
      {errors.questions && (
        <p class="field-error" role="alert">
          {errors.questions}
        </p>
      )}
      <ul class="field-list">
        {questions.map((q, i) => {
          const p = `questions.${i}`;
          return (
            <li key={i} class="field-card">
              <div class="field-card-head">
                <strong>
                  {i + 1}. {q.text || t('surveys.untitled_question')}
                </strong>
                <div class="row">
                  <IconButton icon="chevronLeft" class="rot-90" label={t('common.move_up')} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon="chevronRight" class="rot-90" label={t('common.move_down')} disabled={i === questions.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon="trash" label={t('common.delete')} disabled={questions.length === 1} onClick={() => onChange(questions.filter((_, j) => j !== i))} />
                </div>
              </div>
              <TextInput label={t('surveys.question_text')} value={q.text} maxLength={120} error={errors[`${p}.text`]} onInput={(e) => replace(i, { ...q, text: e.currentTarget.value })} />
              <div class="grid-2">
                <Select<QuestionType>
                  label={t('forms.field.type')}
                  value={q.type}
                  options={QUESTION_TYPES.map((v) => ({ value: v, label: t(`surveys.type.${v}`) }))}
                  onChange={(type) => replace(i, { ...q, type })}
                />
                <TextInput label={t('forms.field.key')} mono value={q.key} maxLength={32} hint={t('forms.field.key_hint')} error={errors[`${p}.key`]} onInput={(e) => replace(i, { ...q, key: e.currentTarget.value })} />
              </div>
              {q.type === 'rating' && (
                <NumberInput label={t('surveys.rating_max')} value={q.rating_max} min={2} max={10} error={errors[`${p}.rating_max`]} onChange={(n) => replace(i, { ...q, rating_max: n })} />
              )}
              {q.type === 'choice' && (
                <TextArea
                  label={t('forms.field.options')}
                  hint={t('forms.field.options_hint')}
                  rows={4}
                  value={(q.options ?? []).join('\n')}
                  error={errors[`${p}.options`]}
                  onInput={(e) => replace(i, { ...q, options: e.currentTarget.value.split('\n').map((o) => o.trim()).filter(Boolean) })}
                />
              )}
              <Checkbox checked={q.required} onChange={(required) => replace(i, { ...q, required })} label={t('forms.field.required')} />
            </li>
          );
        })}
      </ul>
      <Button
        icon="plus"
        disabled={questions.length >= MAX_QUESTIONS}
        onClick={() => onChange([...questions, { key: nextQuestionKey(questions), text: '', type: 'text', required: false, options: [], rating_max: 5 }])}
      >
        {t('surveys.add_question')}
      </Button>
    </div>
  );
}
