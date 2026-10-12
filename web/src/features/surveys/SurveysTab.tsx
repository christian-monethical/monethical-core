import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { useMutation, useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { SurveyStored } from '../../api/types';
import { t } from '../../i18n';
import { Button, IconButton } from '../../ui/Button';
import { Badge, Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { SkeletonRows } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SubNav } from '../../ui/SubNav';
import { toastSuccess } from '../../ui/toast';
import { useMe } from '../account/useMe';
import type { TabProps } from '../sites/tabs';
import { createSurvey, deleteSurvey, listSurveys, updateSurvey } from './api';
import { defaultSurvey } from './model';
import { SurveyEditor } from './SurveyEditor';
import { SurveyResultsView } from './SurveyResultsView';

function SurveyList({ siteId }: { siteId: string }) {
  const surveys = useQuery(K.surveys(siteId), () => listSurveys(siteId));
  const me = useMe();
  const [, navigate] = useLocation();
  const [removing, setRemoving] = useState<SurveyStored | null>(null);
  const del = useMutation((s: SurveyStored) => deleteSurvey(siteId, s.survey_id), {
    invalidate: [K.surveys(siteId)],
    onSuccess: () => {
      toastSuccess(t('surveys.deleted'));
      setRemoving(null);
    },
  });
  const max = me.data?.limits.max_surveys_per_site ?? Number.POSITIVE_INFINITY;
  const count = surveys.data?.length ?? 0;
  const atLimit = count >= max;
  return (
    <Card
      title={t('tab.surveys')}
      description={me.data ? t('surveys.usage', { n: count, max }) : undefined}
      actions={
        <Button variant="primary" icon="plus" disabled={atLimit} onClick={() => navigate('/surveys/new')}>
          {t('surveys.new')}
        </Button>
      }
    >
      {atLimit && <p class="notice">{t('surveys.limit_reached')}</p>}
      {surveys.loading ? (
        <SkeletonRows rows={3} height={64} />
      ) : surveys.error !== undefined && !surveys.data ? (
        <ErrorState error={surveys.error} onRetry={() => void surveys.refetch()} />
      ) : count === 0 ? (
        <EmptyState icon="survey" title={t('surveys.empty_title')} text={t('surveys.empty_text')} />
      ) : (
        <ul class="list">
          {surveys.data?.map((s) => (
            <li key={s.survey_id} class="list-row">
              <Link href={`/surveys/${s.survey_id}`} class="list-main">
                <strong>{s.title}</strong>
                <span class="muted">{t('surveys.summary', { q: s.questions?.length ?? 0, r: s.response_count })}</span>
              </Link>
              <Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? t('status.active') : t('status.inactive')}</Badge>
              <Link href={`/surveys/${s.survey_id}/results`} class="btn btn-secondary btn-sm">
                {t('surveys.results')}
              </Link>
              <IconButton icon="trash" label={t('common.delete')} onClick={() => setRemoving(s)} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t('common.delete')}
        message={t('surveys.delete_confirm', { name: removing?.title ?? '' })}
        confirmLabel={t('common.delete')}
        pending={del.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void del.run(removing)}
      />
    </Card>
  );
}

function SurveyDetail({ siteId, surveyId, view }: { siteId: string; surveyId: string; view: 'edit' | 'results' }) {
  const surveys = useQuery(K.surveys(siteId), () => listSurveys(siteId));
  const stored = surveys.data?.find((s) => s.survey_id === surveyId);
  if (surveys.loading) return <SkeletonRows rows={5} height={56} />;
  if (!stored) return <EmptyState icon="survey" title={t('surveys.not_found')} />;
  return (
    <div class="stack-lg">
      <SubNav
        label={stored.title}
        active={view}
        items={[
          { id: 'edit', href: `/surveys/${surveyId}`, label: t('surveys.sub.edit') },
          { id: 'results', href: `/surveys/${surveyId}/results`, label: t('surveys.results') },
        ]}
      />
      {view === 'results' ? (
        <SurveyResultsView siteId={siteId} survey={stored} />
      ) : (
        <SurveyEditor
          key={stored.updated_at}
          siteId={siteId}
          stored={stored}
          initial={defaultSurvey()}
          save={(config) => updateSurvey(siteId, surveyId, config)}
          onSaved={() => undefined}
        />
      )}
    </div>
  );
}

export default function SurveysTab({ site, sub }: TabProps) {
  const [, navigate] = useLocation();
  const [head, view] = sub.split('/').filter(Boolean);
  if (head === 'new') {
    return (
      <>
        <Link href="/surveys" class="back-link">
          {t('common.back')}
        </Link>
        <SurveyEditor
          siteId={site.site_id}
          stored={null}
          initial={defaultSurvey()}
          save={(config) => createSurvey(site.site_id, config)}
          onSaved={() => {
            toastSuccess(t('surveys.created'));
            navigate('/surveys');
          }}
        />
      </>
    );
  }
  if (head) {
    return (
      <>
        <Link href="/surveys" class="back-link">
          {t('common.back')}
        </Link>
        <SurveyDetail siteId={site.site_id} surveyId={head} view={view === 'results' ? 'results' : 'edit'} />
      </>
    );
  }
  return <SurveyList siteId={site.site_id} />;
}
