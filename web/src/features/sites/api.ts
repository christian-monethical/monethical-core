import { api, body } from '../../api/client';
import type { Site, SiteCreate, SiteUpdate } from '../../api/types';

export const listSites = async (): Promise<Site[]> => body(await api.GET('/v1/sites'));

export const getSite = async (id: string): Promise<Site> =>
  body(await api.GET('/v1/sites/{site_id}', { params: { path: { site_id: id } } }));

export const createSite = async (payload: SiteCreate): Promise<Site> =>
  body(await api.POST('/v1/sites', { body: payload }));

export const updateSite = async (id: string, payload: SiteUpdate): Promise<Site> =>
  body(await api.PATCH('/v1/sites/{site_id}', { params: { path: { site_id: id } }, body: payload }));

export const deleteSite = async (id: string): Promise<void> => {
  await api.DELETE('/v1/sites/{site_id}', { params: { path: { site_id: id } } });
};
