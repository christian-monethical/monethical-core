import type { ComponentType } from 'preact';
import { lazy } from 'preact/compat';
import type { Site } from '../../api/types';
import type { Key } from '../../i18n';

/** Props every site tab receives. `sub` is the path below the tab (e.g. `/<formId>`). */
export interface TabProps {
  site: Site;
  sub: string;
}

interface TabDef {
  id: string;
  label: Key;
  load: () => Promise<{ default: ComponentType<TabProps> }>;
}

const defs: TabDef[] = [
  { id: 'overview', label: 'tab.overview', load: () => import('./OverviewTab') },
  { id: 'banner', label: 'tab.banner', load: () => import('../banner/BannerTab') },
  { id: 'forms', label: 'tab.forms', load: () => import('../forms/FormsTab') },
  { id: 'newsletter', label: 'tab.newsletter', load: () => import('../newsletter/NewsletterTab') },
  { id: 'surveys', label: 'tab.surveys', load: () => import('../surveys/SurveysTab') },
  { id: 'catalog', label: 'tab.catalog', load: () => import('../catalog/CatalogTab') },
  { id: 'bookings', label: 'tab.bookings', load: () => import('../bookings/BookingsTab') },
  { id: 'consents', label: 'tab.consents', load: () => import('../consents/ConsentsTab') },
  { id: 'keys', label: 'tab.keys', load: () => import('../keys/KeysTab') },
  { id: 'analytics', label: 'tab.analytics', load: () => import('../analytics/AnalyticsTab') },
];

export const TABS = defs.map((d) => ({ ...d, Component: lazy(d.load) }));
export const tabById = (id: string) => TABS.find((x) => x.id === id) ?? TABS[0];
