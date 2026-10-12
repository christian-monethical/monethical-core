import { useId } from 'preact/hooks';
import { t } from '../../i18n';
import type { Key } from '../../i18n';
import type { Layout } from './model';
import { LAYOUTS } from './model';

/** Schematic of where the banner sits in the page (the dark block). */
const SHAPES: Record<Layout, { x: number; y: number; w: number; h: number }> = {
  'bar-bottom': { x: 4, y: 30, w: 52, h: 10 },
  'bar-top': { x: 4, y: 4, w: 52, h: 10 },
  'card-left': { x: 6, y: 20, w: 20, h: 22 },
  'card-right': { x: 34, y: 20, w: 20, h: 22 },
  modal: { x: 14, y: 12, w: 32, h: 22 },
};

const LABELS: Record<Layout, Key> = {
  'bar-bottom': 'banner.layout.bar-bottom',
  'bar-top': 'banner.layout.bar-top',
  'card-left': 'banner.layout.card-left',
  'card-right': 'banner.layout.card-right',
  modal: 'banner.layout.modal',
};

export function LayoutPicker({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  const id = useId();
  return (
    <div class="field">
      <span class="field-label" id={`${id}-l`}>
        {t('banner.layout')}
      </span>
      <div class="layout-cards" role="radiogroup" aria-labelledby={`${id}-l`}>
        {LAYOUTS.map((l) => {
          const s = SHAPES[l];
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === value}
              class={`layout-card${l === value ? ' is-on' : ''}`}
              onClick={() => onChange(l)}
            >
              <svg viewBox="0 0 60 46" aria-hidden="true" focusable="false">
                <rect x="1" y="1" width="58" height="44" rx="4" class="lc-page" />
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="3" class="lc-banner" />
              </svg>
              <span>{t(LABELS[l])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
