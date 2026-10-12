import { useMemo, useState } from 'preact/hooks';
import { store } from '../../api/cache';
import { useMutation, useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { ItemStored } from '../../api/types';
import { formatMoney, lang, t } from '../../i18n';
import { Button, IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { SkeletonRows } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { toastSuccess } from '../../ui/toast';
import { blockDays, clearPrice, getCalendar, listPrices, setPrice } from './api';
import { addDays, daysBetween, fromIso, monthMatrix, todayIso } from './dates';
import { MoneyField } from './MoneyField';
import './calendar.css';

const MAX_RANGE = 90;

/**
 * Month calendar to price and block days of an item. Pick a start and an end day, then apply an
 * action to the whole range. Blocked and booked days come from the calendar endpoint.
 */
export function PricingCalendar({ siteId, item }: { siteId: string; item: ItemStored }) {
  const prices = useQuery(K.prices(siteId, item.item_id), () => listPrices(siteId, item.item_id));
  const today = todayIso();
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [range, setRange] = useState<[string, string] | null>(null);
  const [priceCents, setPriceCents] = useState(item.price_cents);

  const overrides = useMemo(() => new Map((prices.data ?? []).filter((p) => !p.day.includes('T')).map((p) => [p.day, p.price_cents])), [prices.data]);
  const slotOverrides = (prices.data ?? []).filter((p) => p.day.includes('T'));
  const weeks = monthMatrix(cursor.y, cursor.m);
  const gridFrom = weeks[0]?.[0] ?? today;
  const gridTo = addDays(weeks[5]?.[6] ?? today, 1);
  const monthKey = `${cursor.y}-${cursor.m}`;
  const calendar = useQuery(K.calendar(siteId, item.item_id, monthKey), () => getCalendar(siteId, item.item_id, gridFrom, gridTo), 15_000);
  const blocked = useMemo(() => new Set((calendar.data ?? []).filter((d) => d.blocked).map((d) => d.day)), [calendar.data]);
  const refreshCalendar = (): void => store.invalidate(K.calendar(siteId, item.item_id, ''));
  const title = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString(lang.value === 'it' ? 'it-IT' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdays = weeks[0]?.map((d) => fromIso(d).toLocaleDateString(lang.value === 'it' ? 'it-IT' : 'en-GB', { weekday: 'short', timeZone: 'UTC' })) ?? [];

  const preview = anchor && hover ? ([anchor, hover].sort() as [string, string]) : range;
  const inRange = (d: string): boolean => (preview ? d >= preview[0] && d <= preview[1] : false);
  const selected = range ? daysBetween(range[0], range[1]) : [];
  const tooLong = selected.length > MAX_RANGE;

  const pick = (d: string): void => {
    if (!anchor) {
      setAnchor(d);
      setRange([d, d]);
    } else {
      setRange([anchor, d].sort() as [string, string]);
      setAnchor(null);
    }
  };
  const shift = (delta: number): void =>
    setCursor(({ y, m }) => {
      const next = new Date(Date.UTC(y, m + delta, 1));
      return { y: next.getUTCFullYear(), m: next.getUTCMonth() };
    });

  const applyPrice = useMutation(
    async () => {
      for (let i = 0; i < selected.length; i += 8) {
        await Promise.all(selected.slice(i, i + 8).map((date) => setPrice(siteId, item.item_id, { date, price_cents: priceCents })));
      }
    },
    { invalidate: [K.prices(siteId, item.item_id)], onSuccess: () => toastSuccess(t('calendar.price_set', { n: selected.length })) },
  );
  const removePrices = useMutation(
    async () => {
      const targets = selected.filter((d) => overrides.has(d));
      for (let i = 0; i < targets.length; i += 8) {
        await Promise.all(targets.slice(i, i + 8).map((d) => clearPrice(siteId, item.item_id, d)));
      }
    },
    { invalidate: [K.prices(siteId, item.item_id)], onSuccess: () => toastSuccess(t('calendar.price_cleared')) },
  );
  const removeSlot = useMutation((day: string) => clearPrice(siteId, item.item_id, day), { invalidate: [K.prices(siteId, item.item_id)] });
  const setBlock = useMutation(
    (block: boolean) => {
      const [start, end] = range ?? [today, today];
      return blockDays(siteId, item.item_id, { start, end: addDays(end, 1), blocked: block }).then(() => block);
    },
    {
      onSuccess: (block) => {
        refreshCalendar();
        toastSuccess(block ? t('calendar.blocked_ok') : t('calendar.unblocked_ok'));
      },
    },
  );

  if (prices.loading) return <SkeletonRows rows={6} height={48} />;
  if (prices.error !== undefined && !prices.data) return <ErrorState error={prices.error} onRetry={() => void prices.refetch()} />;

  return (
    <div class="grid-cal">
      <Card
        title={title}
        actions={
          <>
            <IconButton icon="chevronLeft" label={t('calendar.prev')} onClick={() => shift(-1)} />
            <IconButton icon="chevronRight" label={t('calendar.next')} onClick={() => shift(1)} />
          </>
        }
      >
        <div class="cal" role="grid" aria-label={title}>
          <div class="cal-row cal-head" role="row">
            {weekdays.map((w) => (
              <span key={w} role="columnheader">
                {w}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div class="cal-row" role="row" key={week[0]}>
              {week.map((d) => {
                const out = Number(d.slice(5, 7)) - 1 !== cursor.m;
                const price = overrides.get(d);
                const isBlocked = blocked.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    class={`cal-day${out ? ' is-out' : ''}${inRange(d) ? ' is-sel' : ''}${d === today ? ' is-today' : ''}${isBlocked ? ' is-blocked' : ''}${price !== undefined ? ' has-price' : ''}`}
                    aria-selected={inRange(d)}
                    aria-label={`${d}${price !== undefined ? `, ${formatMoney(price)}` : ''}${isBlocked ? `, ${t('calendar.blocked')}` : ''}`}
                    onClick={() => pick(d)}
                    onMouseEnter={() => anchor && setHover(d)}
                    onFocus={() => anchor && setHover(d)}
                  >
                    <span class="cal-num">{Number(d.slice(8))}</span>
                    <span class="cal-price">{isBlocked ? <Icon name="lock" size={12} /> : price !== undefined ? formatMoney(price).replace(/\s?€|\s?EUR/, '') : ''}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p class="muted cal-legend">{t('calendar.legend', { base: formatMoney(item.price_cents) })}</p>
      </Card>

      <Card title={t('calendar.actions')} description={range ? t('calendar.selection', { from: range[0], to: range[1], n: selected.length }) : t('calendar.pick')}>
        <div class="stack">
          <MoneyField label={t('calendar.price_for_range')} cents={priceCents} onChange={setPriceCents} />
          <Button variant="primary" disabled={!range || tooLong} loading={applyPrice.pending} onClick={() => void applyPrice.run(undefined)}>
            {t('calendar.apply_price')}
          </Button>
          <Button disabled={!range || tooLong || !selected.some((d) => overrides.has(d))} loading={removePrices.pending} onClick={() => void removePrices.run(undefined)}>
            {t('calendar.clear_price')}
          </Button>
          <hr />
          <div class="row">
            <Button icon="lock" disabled={!range || tooLong} loading={setBlock.pending} onClick={() => void setBlock.run(true)}>
              {t('calendar.block')}
            </Button>
            <Button disabled={!range || tooLong} loading={setBlock.pending} onClick={() => void setBlock.run(false)}>
              {t('calendar.unblock')}
            </Button>
          </div>
          {tooLong && <p class="field-error">{t('calendar.too_long', { max: MAX_RANGE })}</p>}
          {slotOverrides.length > 0 && (
            <>
              <h3 class="subhead">{t('calendar.slot_prices')}</h3>
              <ul class="slot-prices">
                {slotOverrides.map((p) => (
                  <li key={p.day}>
                    <span>{p.day.replace('T', ' ')}</span>
                    <strong>{formatMoney(p.price_cents)}</strong>
                    <IconButton
                      icon="trash"
                      label={t('common.delete')}
                      onClick={() => void removeSlot.run(p.day)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
