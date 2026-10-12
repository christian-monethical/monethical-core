import type { Surface } from '../../api/types';
import { t } from '../../i18n';
import { ColorField } from '../../ui/ColorField';
import { Select } from '../../ui/Field';
import { Segmented } from '../../ui/Segmented';
import { Slider } from '../../ui/Slider';
import type { Errors } from './rules';

interface Props {
  value: Surface;
  onChange: (next: Surface) => void;
  errors?: Errors;
}

/** Every design token of the closed `Surface` vocabulary as a structured control. */
export function SurfaceEditor({ value, onChange }: Props) {
  const set = <K extends keyof Surface>(key: K, v: Surface[K]): void => onChange({ ...value, [key]: v });
  return (
    <div class="stack">
      <div class="grid-2">
        <ColorField label={t('design.background')} value={value.background} onChange={(v) => set('background', v)} />
        <ColorField label={t('design.text')} value={value.text} onChange={(v) => set('text', v)} />
        <ColorField label={t('design.muted')} value={value.muted} onChange={(v) => set('muted', v)} />
        <ColorField label={t('design.border')} value={value.border} onChange={(v) => set('border', v)} />
        <ColorField label={t('design.accent')} value={value.accent} onChange={(v) => set('accent', v)} />
        <ColorField label={t('design.accent_text')} value={value.accent_text} onChange={(v) => set('accent_text', v)} />
      </div>
      <Slider label={t('design.radius')} value={value.radius} min={0} max={32} unit="px" onChange={(v) => set('radius', v)} />
      <Segmented<Surface['elevation']>
        label={t('design.elevation')}
        value={value.elevation}
        onChange={(v) => set('elevation', v)}
        options={[
          { value: 'none', label: t('design.elev.none') },
          { value: 'low', label: t('design.elev.low') },
          { value: 'medium', label: t('design.elev.medium') },
          { value: 'high', label: t('design.elev.high') },
        ]}
      />
      <Segmented<Surface['density']>
        label={t('design.density')}
        value={value.density}
        onChange={(v) => set('density', v)}
        options={[
          { value: 'compact', label: t('design.dens.compact') },
          { value: 'comfortable', label: t('design.dens.comfortable') },
          { value: 'spacious', label: t('design.dens.spacious') },
        ]}
      />
      <Select<Surface['font']>
        label={t('design.font')}
        value={value.font}
        onChange={(v) => set('font', v)}
        options={[
          { value: 'system', label: t('design.font.system') },
          { value: 'serif', label: t('design.font.serif') },
          { value: 'rounded', label: t('design.font.rounded') },
          { value: 'mono', label: t('design.font.mono') },
        ]}
      />
    </div>
  );
}
