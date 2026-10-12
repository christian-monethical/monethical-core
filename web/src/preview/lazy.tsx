import { lazy, Suspense } from 'preact/compat';
import { Skeleton } from '../ui/Skeleton';
import type * as Adapter from './adapter';

/** Previews pull in the whole widgets runtime, so editors load it on demand while their controls render. */
const load = () => import('./adapter');

const Banner = lazy(() => load().then((m) => ({ default: m.BannerPreview })));
const Form = lazy(() => load().then((m) => ({ default: m.FormPreview })));
const Newsletter = lazy(() => load().then((m) => ({ default: m.NewsletterPreview })));
const Survey = lazy(() => load().then((m) => ({ default: m.SurveyPreview })));
const Item = lazy(() => load().then((m) => ({ default: m.ItemPreview })));

const fallback = <Skeleton height={300} />;

type P<K extends keyof typeof Adapter> = Parameters<(typeof Adapter)[K]>[0];

export const BannerPreview = (p: P<'BannerPreview'>) => (
  <Suspense fallback={fallback}>
    <Banner {...p} />
  </Suspense>
);
export const FormPreview = (p: P<'FormPreview'>) => (
  <Suspense fallback={fallback}>
    <Form {...p} />
  </Suspense>
);
export const NewsletterPreview = (p: P<'NewsletterPreview'>) => (
  <Suspense fallback={fallback}>
    <Newsletter {...p} />
  </Suspense>
);
export const SurveyPreview = (p: P<'SurveyPreview'>) => (
  <Suspense fallback={fallback}>
    <Survey {...p} />
  </Suspense>
);
export const ItemPreview = (p: P<'ItemPreview'>) => (
  <Suspense fallback={fallback}>
    <Item {...p} />
  </Suspense>
);
