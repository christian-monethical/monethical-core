import { useState } from 'preact/hooks';
import { useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import { METRICS } from '../../api/types';
import type { Analytics, Metric } from '../../api/types';
import { formatNumber, t } from '../../i18n';
import { Card } from '../../ui/Card';
import { AreaChart, Sparkline } from '../../ui/charts';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import type { TabProps } from '../sites/tabs';
import { getAnalytics } from './api';
import './analytics.css';

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

/** Two derived tiles on top of the raw counters. */
function rate(num: number, den: number): string {
  return den === 0 ? '—' : `${Math.round((num / den) * 100)}%`;
}

function Kpi({ metric, data, active, onSelect }: { metric: Metric; data: Analytics; active: boolean; onSelect: () => void }) {
  const values = data.series.map((p) => p[metric]);
  return (
    <button type="button" class={`kpi${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onSelect}>
      <span class="kpi-label">{t(`analytics.m.${metric}`)}</span>
      <strong class="kpi-value">{formatNumber(data.totals[metric])}</strong>
      <Sparkline values={values} label={t('analytics.trend', { name: t(`analytics.m.${metric}`) })} />
    </button>
  );
}

export default function AnalyticsTab({ site }: TabProps) {
  const [days, setDays] = useState<Period>(30);
  const [metric, setMetric] = useState<Metric>('consent_total');
  const res = useQuery(K.analytics(site.site_id, days), () => getAnalytics(site.site_id, days), 60_000);
  const data = res.data;

  return (
    <div class="stack-lg">
      <div class="toolbar">
        <Segmented<`${Period}`>
          label={t('analytics.period')}
          value={`${days}`}
          onChange={(v) => setDays(Number(v) as Period)}
          options={PERIODS.map((p) => ({ value: `${p}` as `${Period}`, label: t('analytics.days', { n: p }) }))}
        />
      </div>
      {res.error !== undefined && !data ? (
        <ErrorState error={res.error} onRetry={() => void res.refetch()} />
      ) : !data ? (
        <div class="kpi-grid" role="status" aria-busy="true">
          {METRICS.map((m) => (
            <Skeleton key={m} height={104} />
          ))}
        </div>
      ) : (
        <>
          <div class="kpi-grid">
            {METRICS.map((m) => (
              <Kpi key={m} metric={m} data={data} active={m === metric} onSelect={() => setMetric(m)} />
            ))}
            <div class="kpi kpi-static">
              <span class="kpi-label">{t('analytics.analytics_rate')}</span>
              <strong class="kpi-value">{rate(data.totals.consent_analytics, data.totals.consent_total)}</strong>
            </div>
            <div class="kpi kpi-static">
              <span class="kpi-label">{t('analytics.marketing_rate')}</span>
              <strong class="kpi-value">{rate(data.totals.consent_marketing, data.totals.consent_total)}</strong>
            </div>
          </div>
          <Card title={t(`analytics.m.${metric}`)} description={t('analytics.range', { n: data.days })}>
            {data.series.every((p) => p[metric] === 0) ? (
              <p class="muted">{t('analytics.empty')}</p>
            ) : (
              <AreaChart values={data.series.map((p) => p[metric])} labels={data.series.map((p) => p.day)} caption={t('analytics.trend', { name: t(`analytics.m.${metric}`) })} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
