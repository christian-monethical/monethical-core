import { api, body } from '../../api/client';
import type { NewsletterConfig, Page, Subscriber } from '../../api/types';

const site = (siteId: string) => ({ params: { path: { site_id: siteId } } });

export const getNewsletter = async (siteId: string): Promise<NewsletterConfig> =>
  body(await api.GET('/v1/sites/{site_id}/newsletter', site(siteId)));

export const saveNewsletter = async (siteId: string, config: NewsletterConfig): Promise<NewsletterConfig> =>
  body(await api.PUT('/v1/sites/{site_id}/newsletter', { ...site(siteId), body: config }));

export const listSubscribers = async (siteId: string, cursor: string | undefined): Promise<Page<Subscriber>> =>
  body(
    await api.GET('/v1/sites/{site_id}/subscribers', {
      params: { path: { site_id: siteId }, query: { limit: 50, cursor } },
    }),
  );
