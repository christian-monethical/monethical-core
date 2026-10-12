import { useState } from 'preact/hooks';
import { formatNumber } from '../i18n';
import './charts.css';

/* Small dependency-free SVG charts. Colors come from CSS variables (see charts.css). */

export interface Bar {
  label: string;
  value: number;
}

/** Horizontal bars with the value and share next to each label. */
export function HBars({ data, caption }: { data: Bar[]; caption: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul class="hbars" aria-label={caption}>
      {data.map((d) => (
        <li key={d.label}>
          <span class="hb-label">{d.label}</span>
          <svg class="hb-track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
            <rect class="hb-bg" width="100" height="8" rx="4" />
            <rect class="hb-fill" width={Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)} height="8" rx="4" />
          </svg>
          <span class="hb-value">
            {formatNumber(d.value)}
            {total > 0 && <small> {Math.round((d.value / total) * 100)}%</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const linePath = (values: number[], w: number, h: number, pad: number, max: number): string =>
  values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

/** Tiny trend line for KPI tiles. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <svg class="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label}>
      <path class="sp-line" d={linePath(values, 100, 28, 2, max)} vector-effect="non-scaling-stroke" />
    </svg>
  );
}

interface AreaProps {
  values: number[];
  labels: string[];
  caption: string;
}

/** Area chart with a hover/keyboard readout. */
export function AreaChart({ values, labels, caption }: AreaProps) {
  const [active, setActive] = useState<number | null>(null);
  const W = 600;
  const H = 180;
  const max = Math.max(1, ...values);
  const line = linePath(values, W, H, 8, max);
  const area = values.length > 0 ? `${line} L${W} ${H} L0 ${H} Z` : '';
  const at = (e: PointerEvent): void => {
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    setActive(Math.min(values.length - 1, Math.max(0, Math.round(ratio * (values.length - 1)))));
  };
  const cursorX = active === null ? null : values.length === 1 ? W / 2 : (active / (values.length - 1)) * W;
  return (
    <figure class="areachart">
      <figcaption class="area-readout" aria-live="polite">
        {active === null ? caption : `${labels[active] ?? ''}: ${formatNumber(values[active] ?? 0)}`}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={caption}
        tabIndex={0}
        onPointerMove={at}
        onPointerLeave={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setActive((a) => Math.min(values.length - 1, (a ?? -1) + 1));
          else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? values.length) - 1));
          else if (e.key === 'Escape') setActive(null);
        }}
        onBlur={() => setActive(null)}
      >
        <line class="ac-grid" x1="0" x2={W} y1={H - 8} y2={H - 8} vector-effect="non-scaling-stroke" />
        <line class="ac-grid" x1="0" x2={W} y1={8} y2={8} vector-effect="non-scaling-stroke" />
        <path class="ac-area" d={area} />
        <path class="ac-line" d={line} vector-effect="non-scaling-stroke" />
        {cursorX !== null && <line class="ac-cursor" x1={cursorX} x2={cursorX} y1="0" y2={H} vector-effect="non-scaling-stroke" />}
      </svg>
      <div class="area-axis" aria-hidden="true">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </figure>
  );
}
