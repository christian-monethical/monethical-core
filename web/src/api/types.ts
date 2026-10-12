import type { components } from './schema';

type S = components['schemas'];

export type Me = S['MeOut'];
export type Site = S['SiteOut'];
export type SiteCreate = S['SiteCreate'];
export type SiteUpdate = S['SiteUpdate'];
export type Surface = S['Surface'];
export type BannerConfig = S['BannerConfig'];
export type BannerStored = S['BannerStored'];
export type BannerTexts = S['BannerTexts'];
export type FormConfig = S['FormConfig'];
export type FormStored = S['FormStored'];
export type FormField = S['FormField'];
export type Submission = S['SubmissionOut'];
export type NewsletterConfig = S['NewsletterConfig'];
export type Subscriber = S['SubscriberOut'];
export type SurveyConfig = S['SurveyConfig'];
export type SurveyStored = S['SurveyStored'];
export type Question = S['Question'];
export type ItemConfig = S['ItemConfig'];
export type ItemStored = S['ItemStored'];
export type Booking = S['BookingOut'];
export type BookingStatus = Booking['status'];
export type Consent = S['ConsentOut'];
export type KeyOut = S['KeyOut'];
export type KeyCreated = S['KeyCreated'];
export type KeyScope = 'consents:read' | 'submissions:read' | 'bookings:read';
export type Account = S['AccountOut'];
export type PlanId = 'FREE' | 'PRO' | 'EMPIRE';

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export const METRICS = [
  'consent_total',
  'consent_analytics',
  'consent_marketing',
  'form_submissions',
  'newsletter_signups',
  'survey_responses',
  'bookings',
] as const;
export type Metric = (typeof METRICS)[number];

export type Analytics = S['AnalyticsOut'];
export type SurveyResults = S['SurveyResults'];
export type QuestionResult = S['QuestionResult'];
export type PriceOverride = S['PriceOverrideOut'];
export type DayAvailability = S['DayAvailability'];
export type Limits = S['LimitsOut'];
export type StripeStatus = S['StripeStatusOut'];
