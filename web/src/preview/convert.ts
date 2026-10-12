import type { BannerConfig, FormConfig, ItemConfig, NewsletterConfig, SurveyConfig } from '../api/types';
import { emptyTexts } from '../features/banner/model';
import { DEFAULT_SURFACE } from '../features/design/defaults';
import type { WidgetBanner, WidgetForm, WidgetItem, WidgetNewsletter, WidgetSurvey } from './widget-types';

/** Editing models -> the public `site.json` shapes the widgets render (defaults filled in). */

export const toWidgetBanner = (c: BannerConfig): WidgetBanner => ({
  ...c,
  surface: c.surface ?? DEFAULT_SURFACE,
  texts: c.texts ?? emptyTexts(),
  logo_url: c.logo_url ?? null,
  privacy_url: c.privacy_url ?? null,
  categories: c.categories ?? ['necessary'],
});

export const toWidgetForm = (c: FormConfig): WidgetForm => ({
  form_id: 'preview',
  name: c.name,
  fields: (c.fields ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder ?? undefined,
    options: f.options ?? [],
    max_length: f.max_length,
  })),
  submit_label: c.submit_label,
  success_message: c.success_message,
  privacy_text: c.privacy_text,
  privacy_required: c.privacy_required,
  privacy_url: c.privacy_url ?? null,
  surface: c.surface ?? DEFAULT_SURFACE,
});

export const toWidgetNewsletter = (c: NewsletterConfig): WidgetNewsletter => ({
  ...c,
  privacy_url: c.privacy_url ?? null,
  surface: c.surface ?? DEFAULT_SURFACE,
});

export const toWidgetSurvey = (c: SurveyConfig): WidgetSurvey => ({
  survey_id: 'preview',
  title: c.title,
  description: c.description,
  questions: (c.questions ?? []).map((q) => ({ ...q, options: q.options ?? [] })),
  submit_label: c.submit_label,
  success_message: c.success_message,
  surface: c.surface ?? DEFAULT_SURFACE,
});

export const toWidgetItem = (c: ItemConfig): WidgetItem => ({
  ...c,
  item_id: 'preview',
  image_url: c.image_url ?? null,
  gallery: c.gallery ?? [],
  amenities: c.amenities ?? [],
  available_from: c.available_from ?? null,
  available_to: c.available_to ?? null,
  slots: c.slots ?? [],
  duration_min: c.duration_min ?? null,
  surface: c.surface ?? DEFAULT_SURFACE,
});
