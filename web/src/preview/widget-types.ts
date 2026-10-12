/**
 * Shapes the widget previews consume (mirror of widgets/src/types.ts, i.e. the public
 * `site.json` snapshot). The adapter converts the console's editing models into these.
 */
import type { Surface } from '../api/types';

export type { Surface };

export interface PreviewHandle<C> {
  update(config: C): void;
  destroy(): void;
}

export interface BannerTexts {
  title: string;
  body: string;
  accept_all: string;
  reject_all: string;
  customize: string;
  save: string;
  privacy_link_label: string;
  reopen_label: string;
  necessary_label: string;
  necessary_description: string;
  preferences_label: string;
  preferences_description: string;
  analytics_label: string;
  analytics_description: string;
  marketing_label: string;
  marketing_description: string;
}

export interface WidgetBanner {
  enabled: boolean;
  layout: 'bar-bottom' | 'bar-top' | 'card-left' | 'card-right' | 'modal';
  language: string;
  surface: Surface;
  texts: BannerTexts;
  logo_url: string | null;
  privacy_url: string | null;
  categories: ('necessary' | 'preferences' | 'analytics' | 'marketing')[];
  show_reopen_badge: boolean;
  consent_expiry_days: number;
  google_consent_mode: boolean;
  version?: number;
  updated_at?: string;
}

export interface WidgetFormField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';
  required: boolean;
  placeholder?: string;
  options: string[];
  max_length: number;
}

export interface WidgetForm {
  form_id: string;
  name: string;
  fields: WidgetFormField[];
  submit_label: string;
  success_message: string;
  privacy_text: string;
  privacy_required: boolean;
  privacy_url: string | null;
  surface: Surface;
}

export interface WidgetNewsletter {
  enabled: boolean;
  headline: string;
  subheadline: string;
  button_label: string;
  email_placeholder: string;
  privacy_text: string;
  privacy_url: string | null;
  success_message: string;
  surface: Surface;
}

export interface WidgetSurvey {
  survey_id: string;
  title: string;
  description: string;
  questions: {
    key: string;
    text: string;
    type: 'text' | 'rating' | 'choice' | 'boolean';
    required: boolean;
    options: string[];
    rating_max: number;
  }[];
  submit_label: string;
  success_message: string;
  surface: Surface;
}

export interface WidgetItem {
  item_id: string;
  name: string;
  slug: string;
  type: 'ROOM' | 'EXPERIENCE' | 'PRODUCT';
  description: string;
  price_cents: number;
  capacity: number;
  cta_mode: 'request' | 'book' | 'pay';
  image_url: string | null;
  gallery: string[];
  amenities: string[];
  discount_per_missing_guest_cents: number;
  available_from: string | null;
  available_to: string | null;
  min_nights: number;
  slots: string[];
  duration_min: number | null;
  active: boolean;
  button_text: string;
  surface: Surface;
}
