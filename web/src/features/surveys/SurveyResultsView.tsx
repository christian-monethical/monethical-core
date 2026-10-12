import { useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { SurveyStored } from '../../api/types';
import { formatNumber, t } from '../../i18n';
import { Card } from '../../ui/Card';
import { HBars } from '../../ui/charts';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { getResults } from './api';

export function SurveyResultsView({ siteId, survey }: { siteId: string; survey: SurveyStored }) {
  const res = useQuery(K.surveyResults(siteId, survey.survey_id), () => getResults(siteId, survey.survey_id), 15_000);
  if (res.loading) return <SkeletonRows rows={4} height={96} />;
  if (res.error !== undefined && !res.data) return <ErrorState error={res.error} onRetry={() => void res.refetch()} />;
  const data = res.data;
  if (!data || data.responses === 0) return <EmptyState icon="survey" title={t('surveys.no_results')} text={t('surveys.no_results_text')} />;

  return (
    <div class="stack-lg">
      <p class="muted">{t('surveys.responses', { n: formatNumber(data.responses) })}</p>
      {survey.questions?.map((q) => {
        const r = data.questions[q.key];
        return (
          <Card key={q.key} title={q.text} description={r ? t('surveys.answers', { n: r.count }) : undefined}>
            {!r || r.count === 0 ? (
              <p class="muted">{t('surveys.no_answers')}</p>
            ) : q.type === 'text' ? (
              <ul class="samples">
                {r.samples?.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : (
              <>
                {q.type === 'rating' && r.average != null && (
                  <p class="kpi-inline">
                    <strong>{r.average.toFixed(2)}</strong> / {q.rating_max}
                  </p>
                )}
                <HBars
                  caption={q.text}
                  data={
                    q.type === 'rating'
                      ? Array.from({ length: q.rating_max }, (_, i) => ({ label: String(i + 1), value: r.distribution?.[String(i + 1)] ?? 0 }))
                      : q.type === 'boolean'
                        ? [
                            { label: t('common.yes'), value: r.distribution?.True ?? r.distribution?.true ?? 0 },
                            { label: t('common.no'), value: r.distribution?.False ?? r.distribution?.false ?? 0 },
                          ]
                        : (q.options ?? []).map((o) => ({ label: o, value: r.distribution?.[o] ?? 0 }))
                  }
                />
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
