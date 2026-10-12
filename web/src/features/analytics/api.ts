import { api, body } from '../../api/client';
import type { Analytics } from '../../api/types';

export const getAnalytics = async (siteId: string, days: number): Promise<Analytics> =>
  body(await api.GET('/v1/sites/{site_id}/analytics', { params: { path: { site_id: siteId }, query: { days } } }));
