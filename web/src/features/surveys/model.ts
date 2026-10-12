import type { Question, SurveyConfig, SurveyStored } from '../../api/types';
import { t } from '../../i18n';
import { DEFAULT_SURFACE } from '../design/defaults';
import { Check, FIELD_KEY_RE, LIMITS, validateSurface } from '../design/rules';
import type { Errors } from '../design/rules';

export type QuestionType = Question['type'];
export const QUESTION_TYPES: QuestionType[] = ['text', 'rating', 'choice', 'boolean'];
export const MAX_QUESTIONS = 30;

export function defaultSurvey(): SurveyConfig {
  return {
    title: '',
    description: '',
    active: true,
    questions: [{ key: 'q_1', text: '', type: 'rating', required: true, options: [], rating_max: 5 }],
    submit_label: t('surveys.default_submit'),
    success_message: t('surveys.default_success'),
    surface: { ...DEFAULT_SURFACE },
  };
}

export function surveyFromStored(stored: SurveyStored): SurveyConfig {
  const { survey_id, created_at, updated_at, response_count, ...config } = stored;
  return config;
}

export function nextQuestionKey(questions: Question[]): string {
  const taken = new Set(questions.map((q) => q.key));
  for (let i = questions.length + 1; ; i++) if (!taken.has(`q_${i}`)) return `q_${i}`;
}

export function validateSurvey(c: SurveyConfig): Errors {
  const k = new Check();
  k.text('title', c.title, LIMITS.short, { required: true });
  k.text('description', c.description, LIMITS.medium);
  k.text('submit_label', c.submit_label, LIMITS.short);
  k.text('success_message', c.success_message, LIMITS.medium);
  const qs = c.questions ?? [];
  if (qs.length < 1 || qs.length > MAX_QUESTIONS) k.fail('questions', t('surveys.questions_count', { max: MAX_QUESTIONS }));
  const seen = new Set<string>();
  qs.forEach((q, i) => {
    const p = `questions.${i}`;
    if (!FIELD_KEY_RE.test(q.key)) k.fail(`${p}.key`, t('forms.key_rule'));
    else if (seen.has(q.key)) k.fail(`${p}.key`, t('surveys.key_dup'));
    seen.add(q.key);
    k.text(`${p}.text`, q.text, LIMITS.short, { required: true });
    const options = q.options ?? [];
    if (options.length > 12 || options.some((o) => o.length > LIMITS.short)) k.fail(`${p}.options`, t('surveys.options_rule'));
    if (q.type === 'choice' && options.length < 2) k.fail(`${p}.options`, t('surveys.choice_needs_two'));
    if (q.type === 'rating') k.range(`${p}.rating_max`, q.rating_max, 2, 10);
  });
  k.merge('surface', validateSurface(c.surface ?? DEFAULT_SURFACE));
  return k.errors;
}
