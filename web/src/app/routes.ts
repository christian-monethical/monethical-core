import { lazy } from 'preact/compat';

/** One lazily loaded chunk per screen. The raw loaders are kept for hover/idle prefetching. */
export const loaders = {
  sites: () => import('../features/sites/SitesPage'),
  workspace: () => import('../features/sites/SiteWorkspace'),
  overview: () => import('../features/sites/OverviewTab'),
  payments: () => import('../features/payments/PaymentsPage'),
  admin: () => import('../features/admin/AccountsPage'),
  account: () => import('../features/account/AccountPage'),
};

export const SitesPage = lazy(loaders.sites);
export const SiteWorkspace = lazy(loaders.workspace);
export const PaymentsPage = lazy(loaders.payments);
export const AccountsPage = lazy(loaders.admin);
export const AccountPage = lazy(loaders.account);
