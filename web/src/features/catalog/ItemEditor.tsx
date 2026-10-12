import { useState } from 'preact/hooks';
import { store } from '../../api/cache';
import { K } from '../../api/keys';
import type { ItemConfig, ItemStored } from '../../api/types';
import { t } from '../../i18n';
import { ItemPreview } from '../../preview/lazy';
import { NumberInput, Select, TextArea, TextInput } from '../../ui/Field';
import { Switch } from '../../ui/Switch';
import { TagInput } from '../../ui/TagInput';
import { DEFAULT_SURFACE } from '../design/defaults';
import { EditorShell, SaveBar, Section } from '../design/EditorShell';
import { SLOT_RE } from '../design/rules';
import { SurfaceEditor } from '../design/SurfaceEditor';
import { useEditor } from '../design/useEditor';
import { MoneyField } from './MoneyField';
import { CTA_MODES, ITEM_TYPES, itemFromStored, slugify, validateItem } from './model';
import type { CtaMode, ItemType } from './model';

interface Props {
  siteId: string;
  stored: ItemStored | null;
  initial: ItemConfig;
  save: (config: ItemConfig) => Promise<ItemStored>;
  onSaved: (stored: ItemStored) => void;
}

const lines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean);

export function ItemEditor({ siteId, stored, initial, save, onSaved }: Props) {
  const { draft, errors, saving, save: submit } = useEditor<ItemConfig, ItemStored>({
    initial: stored ? itemFromStored(stored) : initial,
    validate: validateItem,
    save,
    fromStored: itemFromStored,
    onSaved: (saved) => {
      store.invalidate(K.items(siteId));
      onSaved(saved);
    },
  });
  const c = draft.value;
  // For new items the slug follows the name until the user edits it by hand.
  const [slugTouched, setSlugTouched] = useState(stored !== null);

  return (
    <>
      <EditorShell
        controls={
          <>
            <Section title={t('catalog.section.general')} open>
              <TextInput
                label={t('catalog.name')}
                value={c.name}
                maxLength={120}
                required
                error={errors.name}
                onInput={(e) => {
                  const name = e.currentTarget.value;
                  draft.patch(slugTouched ? { name } : { name, slug: slugify(name) });
                }}
              />
              <TextInput
                label={t('catalog.slug')}
                mono
                value={c.slug}
                maxLength={80}
                hint={t('catalog.slug_hint')}
                error={errors.slug}
                onInput={(e) => {
                  setSlugTouched(true);
                  draft.patch({ slug: e.currentTarget.value });
                }}
              />
              <div class="grid-2">
                <Select<ItemType>
                  label={t('catalog.type')}
                  value={c.type}
                  options={ITEM_TYPES.map((v) => ({ value: v, label: t(`catalog.type.${v}`) }))}
                  onChange={(type) => draft.patch(type === 'EXPERIENCE' ? { type } : { type, slots: [], duration_min: null })}
                />
                <Select<CtaMode>
                  label={t('catalog.cta')}
                  hint={t(`catalog.cta.${c.cta_mode}_hint`)}
                  value={c.cta_mode}
                  options={CTA_MODES.map((v) => ({ value: v, label: t(`catalog.cta.${v}`) }))}
                  onChange={(cta_mode) => draft.patch({ cta_mode })}
                />
              </div>
              <TextArea label={t('catalog.description')} value={c.description} maxLength={2000} rows={5} error={errors.description} onInput={(e) => draft.patch({ description: e.currentTarget.value })} />
              <TextInput label={t('catalog.button_text')} value={c.button_text} maxLength={120} error={errors.button_text} onInput={(e) => draft.patch({ button_text: e.currentTarget.value })} />
              <Switch checked={c.active} onChange={(active) => draft.patch({ active })} label={t('catalog.active')} hint={t('catalog.active_hint')} />
            </Section>
            <Section title={t('catalog.section.pricing')} open>
              <div class="grid-2">
                <MoneyField label={t('catalog.price')} cents={c.price_cents} error={errors.price_cents} onChange={(price_cents) => draft.patch({ price_cents })} />
                <NumberInput
                  label={c.type === 'PRODUCT' ? t('catalog.stock') : t('catalog.capacity')}
                  hint={c.type === 'PRODUCT' ? t('catalog.stock_hint') : t('catalog.capacity_hint')}
                  value={c.capacity}
                  min={0}
                  max={1000}
                  error={errors.capacity}
                  onChange={(capacity) => draft.patch({ capacity })}
                />
              </div>
              {c.type !== 'PRODUCT' && (
                <MoneyField
                  label={t('catalog.discount')}
                  hint={t('catalog.discount_hint')}
                  cents={c.discount_per_missing_guest_cents}
                  error={errors.discount_per_missing_guest_cents}
                  onChange={(discount_per_missing_guest_cents) => draft.patch({ discount_per_missing_guest_cents })}
                />
              )}
            </Section>
            <Section title={t('catalog.section.availability')}>
              <div class="grid-2">
                <TextInput label={t('catalog.available_from')} type="date" value={c.available_from ?? ''} error={errors.available_from} onInput={(e) => draft.patch({ available_from: e.currentTarget.value || null })} />
                <TextInput label={t('catalog.available_to')} type="date" value={c.available_to ?? ''} error={errors.available_to} onInput={(e) => draft.patch({ available_to: e.currentTarget.value || null })} />
              </div>
              {c.type === 'ROOM' && <NumberInput label={t('catalog.min_nights')} value={c.min_nights} min={1} max={60} error={errors.min_nights} onChange={(min_nights) => draft.patch({ min_nights })} />}
              {c.type === 'EXPERIENCE' && (
                <>
                  <TagInput
                    label={t('catalog.slots')}
                    values={c.slots ?? []}
                    onChange={(slots) => draft.patch({ slots })}
                    validate={(v) => (SLOT_RE.test(v) ? null : t('catalog.slots_rule'))}
                    max={12}
                    placeholder="09:30"
                    hint={t('catalog.slots_hint')}
                    error={errors.slots}
                  />
                  <NumberInput label={t('catalog.duration')} value={c.duration_min ?? Number.NaN} min={5} max={1440} error={errors.duration_min} onChange={(n) => draft.patch({ duration_min: Number.isNaN(n) ? null : n })} />
                </>
              )}
            </Section>
            <Section title={t('catalog.section.media')}>
              <TextInput label={t('catalog.image_url')} type="url" placeholder="https://" value={c.image_url ?? ''} error={errors.image_url} onInput={(e) => draft.patch({ image_url: e.currentTarget.value.trim() || null })} />
              <TextArea label={t('catalog.gallery')} hint={t('catalog.gallery_hint')} rows={4} value={(c.gallery ?? []).join('\n')} error={errors.gallery} onInput={(e) => draft.patch({ gallery: lines(e.currentTarget.value) })} />
              <TextArea label={t('catalog.amenities')} hint={t('forms.field.options_hint')} rows={4} value={(c.amenities ?? []).join('\n')} error={errors.amenities} onInput={(e) => draft.patch({ amenities: lines(e.currentTarget.value) })} />
            </Section>
            <Section title={t('design.section')}>
              <SurfaceEditor value={c.surface ?? DEFAULT_SURFACE} onChange={(surface) => draft.patch({ surface })} />
            </Section>
          </>
        }
        preview={<ItemPreview config={c} />}
      />
      <SaveBar dirty={draft.dirty || stored === null} saving={saving} onSave={() => void submit()} onDiscard={draft.reset} saveLabel={stored ? undefined : t('catalog.create')} />
    </>
  );
}
