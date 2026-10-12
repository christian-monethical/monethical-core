/** Shapes of `/config/<site_key>/site.json` (mirrors backend/src/monethical/domain). */

export type FontFamily = 'system' | 'serif' | 'rounded' | 'mono';
export type Elevation = 'none' | 'low' | 'medium' | 'high';
export type Density = 'compact' | 'comfortable' | 'spacious';

export interface Surface {
  background: string;
  text: string;
  muted: string;
  accent: string;
  accent_text: string;
  border: string;
  radius: number;
  elevation: Elevation;
  density: Density;
  font: FontFamily;
}

export type BannerLayout = 'bar-bottom' | 'bar-top' | 'card-left' | 'card-right' | 'modal';
export type ConsentCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing';

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

export interface BannerConfig {
  enabled: boolean;
  layout: BannerLayout;
  language: string;
  surface: Surface;
  texts: BannerTexts;
  logo_url: string | null;
  privacy_url: string | null;
  categories: ConsentCategory[];
  show_reopen_badge: boolean;
  consent_expiry_days: number;
  google_consent_mode: boolean;
  /** Incremented by the backend on every save; a higher value re-asks consent. */
  version?: number;
  updated_at?: string;
}

export type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options: string[];
  max_length: number;
}

export interface PublicForm {
  form_id: string;
  name: string;
  fields: FormField[];
  submit_label: string;
  success_message: string;
  privacy_text: string;
  privacy_required: boolean;
  privacy_url: string | null;
  surface: Surface;
}

export interface NewsletterConfig {
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

export type QuestionType = 'text' | 'rating' | 'choice' | 'boolean';

export interface SurveyQuestion {
  key: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  rating_max: number;
}

export interface PublicSurvey {
  survey_id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  submit_label: string;
  success_message: string;
  surface: Surface;
}

export type ItemType = 'ROOM' | 'EXPERIENCE' | 'PRODUCT';
export type CtaMode = 'request' | 'book' | 'pay';

export interface CatalogItem {
  item_id: string;
  name: string;
  slug: string;
  type: ItemType;
  description: string;
  price_cents: number;
  capacity: number;
  cta_mode: CtaMode;
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

export interface SiteDoc {
  v: number;
  site_key: string;
  generated_at: string;
  banner: BannerConfig | null;
  forms: PublicForm[];
  newsletter: NewsletterConfig | null;
  surveys: PublicSurvey[];
  catalog: CatalogItem[];
}

export interface DayAvailability {
  day: string;
  available: boolean;
  remaining: number | null;
  price_cents: number;
}

export interface BookingOut {
  booking_id: string;
  item_id: string;
  item_name: string;
  start: string;
  end: string;
  slot: string | null;
  guests: number;
  total_cents: number;
  currency: string;
  status: 'PENDING' | 'CONFIRMED' | 'PAID' | 'COMPLETED' | 'CANCELLED';
  cta_mode: CtaMode;
}

export interface BookOut {
  booking: BookingOut;
  checkout_url: string | null;
}

/** What the loader hands to every module. */
export interface Boot {
  key: string;
  /** API origin (serves `/public/*`). */
  api: string;
  doc: SiteDoc;
}

export interface ConsentState {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
}

export type ConsentListener = (state: ConsentState) => void;

/** Public `window.Monethical.consent`. `o`/`l` are the loader's pre-load queue (open request, listeners). */
export interface ConsentApi {
  get(): ConsentState | null;
  open(): void;
  onChange(cb: ConsentListener): () => void;
  o?: boolean;
  l?: ConsentListener[];
}

export interface MonethicalApi {
  v: number;
  consent: ConsentApi;
}
