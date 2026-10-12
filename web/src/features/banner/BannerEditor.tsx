import { store } from '../../api/cache';
import { K } from '../../api/keys';
import type { BannerConfig, BannerStored, BannerTexts } from '../../api/types';
import { t } from '../../i18n';
import { BannerPreview } from '../../preview/lazy';
import { Checkbox, Switch } from '../../ui/Switch';
import { NumberInput, Select, TextArea, TextInput } from '../../ui/Field';
import { DEFAULT_SURFACE } from '../design/defaults';
import { EditorShell, SaveBar, Section } from '../design/EditorShell';
import { SurfaceEditor } from '../design/SurfaceEditor';
import { useEditor } from '../design/useEditor';
import { saveBanner } from './api';
import { LayoutPicker } from './LayoutPicker';
import { bannerFromStored, emptyTexts, LANGUAGES, TEXT_FIELDS, validateBanner } from './model';

type Category = NonNullable<BannerConfig['categories']>[number];
const OPTIONAL_CATEGORIES: Category[] = ['preferences', 'analytics', 'marketing'];

export function BannerEditor({ siteId, stored }: { siteId: string; stored: BannerStored }) {
  const { draft, errors, saving, save } = useEditor<BannerConfig, BannerStored>({
    initial: bannerFromStored(stored),
    validate: validateBanner,
    save: (config) => saveBanner(siteId, config),
    fromStored: bannerFromStored,
    onSaved: (saved) => store.set(K.banner(siteId), saved),
  });
  const c = draft.value;
  const texts: BannerTexts = c.texts ?? emptyTexts();
  const categories = c.categories ?? ['necessary'];

  const toggleCategory = (cat: Category, on: boolean): void =>
    draft.patch({
      categories: ['necessary', ...OPTIONAL_CATEGORIES.filter((x) => (x === cat ? on : categories.includes(x)))],
    });

  return (
    <>
      <EditorShell
        controls={
          <>
            <Section title={t('banner.section.general')} open>
              <Switch checked={c.enabled} onChange={(v) => draft.patch({ enabled: v })} label={t('banner.enabled')} hint={t('banner.enabled_hint')} />
              <LayoutPicker value={c.layout} onChange={(layout) => draft.patch({ layout })} />
              <Select
                label={t('banner.language')}
                value={c.language}
                error={errors.language}
                options={LANGUAGES.map((l) => ({ value: l, label: l.toUpperCase() }))}
                onChange={(language) => draft.patch({ language })}
              />
            </Section>
            <Section title={t('banner.section.texts')} open>
              {TEXT_FIELDS.map(({ key, max, multiline }) =>
                multiline ? (
                  <TextArea
                    key={key}
                    label={t(`banner.text.${key}`)}
                    value={texts[key]}
                    maxLength={max}
                    rows={4}
                    error={errors[`texts.${key}`]}
                    onInput={(e) => draft.patch({ texts: { ...texts, [key]: e.currentTarget.value } })}
                  />
                ) : (
                  <TextInput
                    key={key}
                    label={t(`banner.text.${key}`)}
                    value={texts[key]}
                    maxLength={max}
                    error={errors[`texts.${key}`]}
                    onInput={(e) => draft.patch({ texts: { ...texts, [key]: e.currentTarget.value } })}
                  />
                ),
              )}
            </Section>
            <Section title={t('design.section')}>
              <SurfaceEditor value={c.surface ?? DEFAULT_SURFACE} onChange={(surface) => draft.patch({ surface })} />
            </Section>
            <Section title={t('banner.section.links')}>
              <TextInput
                label={t('banner.logo_url')}
                type="url"
                placeholder="https://"
                value={c.logo_url ?? ''}
                error={errors.logo_url}
                hint={t('rules.https_hint')}
                onInput={(e) => draft.patch({ logo_url: e.currentTarget.value.trim() || null })}
              />
              <TextInput
                label={t('banner.privacy_url')}
                type="url"
                placeholder="https://"
                value={c.privacy_url ?? ''}
                error={errors.privacy_url}
                onInput={(e) => draft.patch({ privacy_url: e.currentTarget.value.trim() || null })}
              />
            </Section>
            <Section title={t('banner.section.consent')}>
              <Checkbox checked disabled onChange={() => undefined} label={t('banner.cat.necessary')} hint={t('banner.necessary_locked')} />
              {OPTIONAL_CATEGORIES.map((cat) => (
                <Checkbox key={cat} checked={categories.includes(cat)} onChange={(on) => toggleCategory(cat, on)} label={t(`banner.cat.${cat}`)} />
              ))}
              <NumberInput
                label={t('banner.expiry')}
                hint={t('banner.expiry_hint')}
                value={c.consent_expiry_days}
                min={1}
                max={395}
                error={errors.consent_expiry_days}
                onChange={(n) => draft.patch({ consent_expiry_days: n })}
              />
              <Switch checked={c.show_reopen_badge} onChange={(v) => draft.patch({ show_reopen_badge: v })} label={t('banner.reopen')} hint={t('banner.reopen_hint')} />
              <Switch checked={c.google_consent_mode} onChange={(v) => draft.patch({ google_consent_mode: v })} label={t('banner.gcm')} hint={t('banner.gcm_hint')} />
            </Section>
          </>
        }
        preview={<BannerPreview config={c} />}
      />
      <SaveBar dirty={draft.dirty} saving={saving} onSave={() => void save()} onDiscard={draft.reset} />
    </>
  );
}
